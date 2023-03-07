import * as vscode from 'vscode';
import * as config from "./config";
import * as krule from "./rule";
import * as kutil from "./util";
import * as fs from "fs";
import * as path from "path";
import * as codeDiagnostics from "./codeDiagnostics"

export namespace Kaudit {

    export class Analysis {

        public static filePath2AnalysisRecords : Map<string, AnalysisRecord[]> = new Map<string, AnalysisRecord[]>();
        public static lang_groupName2AnalysisRecordsMap : Map<string, Map<string, AnalysisRecord[]>> = new Map<string,Map<string, AnalysisRecord[]>>();

        public static async analyze() : Promise<boolean> {

            // verify if there is a workspace folder open to analysis on
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                kutil.Kaudit.Logger.warn('There are no open workspace folders !');
                return true;
            }

            // start message
            kutil.Kaudit.Logger.debug("Analysis.analyze Begin...");

            //try initialize
            Analysis.initialize();

            // clean
            Analysis.clean();

            // traverse -> match -> record
            if(config.Kaudit.Config.analysisDirs.length == 0){
                for (let i = 0; i < vscode.workspace.workspaceFolders.length; i++) {
                    // Obtain our workspace path.
                    const workspaceFolder = vscode.workspace.workspaceFolders[i].uri.fsPath;
                    await kutil.Kaudit.Helper.traverseRecursiveWithFilterAndHandler(workspaceFolder, new Map<any,any>() ,
                        Analysis.analysisHandle,
                        Analysis.anslysisFilter)
                }
            }else{
                // traverse custom dirs
                for(let dir of config.Kaudit.Config.analysisDirs){
                    await kutil.Kaudit.Helper.traverseRecursiveWithFilterAndHandler(dir, new Map<any,any>() ,
                        Analysis.analysisHandle,
                        Analysis.anslysisFilter)
                }
            }
            
            // sort
            Analysis.doSort();

            // statistic
            Analysis.doOutputStatistic();

            kutil.Kaudit.Logger.debug("Analysis.analyze Finished");
            kutil.Kaudit.Logger.show();

            return true;
        }

        private static initialize(){
            //get usersettings
            config.Kaudit.Config.refreshConfigFromUserSetting();
            //force resfresh rules
            krule.Kaudit.RegRules.getOrderedRegexRules(true);
        }

        private static clean(){
            Analysis.filePath2AnalysisRecords.clear();
            Analysis.lang_groupName2AnalysisRecordsMap.clear();
            codeDiagnostics.Kaudit.AnalysisDiagnosticsProvider.kruleAnalysisDiagnostics.clear();
        }

        private static async anslysisFilter(file_path:string, file_state:fs.Stats, shared_map:Map<any,any>):Promise<boolean> {
            //for dir, filter affect whether continue traverse dir and handle dir. false: traverse and handle, true: not traverse and not handle
            //for file, filter affect whether handle file. false: handle file, true: not handle file
            
            // file_path could not in excludePatterns
            for(let pat of config.Kaudit.Config.excludePatterns){
                if(file_path.match(pat)){
                    return true;
                }
            }

            // not follow symbolicLink
            if(file_state.isSymbolicLink()){
                return true;
            }
            // hidden file go continue

            return false;
        }

        private static async analysisHandle(file_path:string, file_state:fs.Stats, shared_map:Map<any,any>):Promise<string> {
            
            //if there is some error, handle will return not empty string,which will show in OutputChannel
            let mes = "";
            if(file_state.isFile()){

                let filext = path.extname(file_path);
                let filelang:string | undefined = undefined;
                if(filext !== ""){
                    let e2l = config.Kaudit.Config.getExt2Lang();
                    filext = filext.substring(1);
                    filelang = e2l.get(filext);
                    if(!filelang && !config.Kaudit.Config.enableAutoFileLangDetect){
                        return mes; 
                    }
                }

                let content:any | undefined = undefined;
                let lines:string[] = [];
                if(!filelang){// if undefined, try read first line to determine file lang; maybe oneday use file-type package to detect                  
                    let fileSize = file_state.size;
                    if (fileSize > config.Kaudit.Config.checkFileLangOfFileSizeLimit) {// if file size > checkFileLangOfFileSizeLimit(default 500k), ignore
                        kutil.Kaudit.Logger.trace(`AnalysisHandle Ignore - ${file_path} filesize > ${config.Kaudit.Config.checkFileLangOfFileSizeLimit} and can't determine filelang by extension`)
                        return mes; 
                    }
                    try {
                        content = await kutil.Kaudit.Helper.asynReadfile(file_path);
                        if (content) {
                            lines = content.toString().split(config.Kaudit.Config.defaultLineSeparator);
                        }
                        if(lines.length > 0){
                            let firstLine = lines[0];
                            if(firstLine.length > config.Kaudit.Config.checkFileLangFirstLineLengthLimit){
                                firstLine = firstLine.substring(0,config.Kaudit.Config.checkFileLangFirstLineLengthLimit)
                            }
                            for(let lang of config.Kaudit.Config.getSupportProgramLangs().keys()){
                                if(firstLine.includes(lang)){
                                    filelang = lang;
                                    break;
                                }
                            }
                            if(!filelang){
                                kutil.Kaudit.Logger.trace(`AnalysisHandle Ignore - Can't determine file lang of ${file_path}`);
                                return mes;
                            } 
                        }else{
                            kutil.Kaudit.Logger.trace(`AnalysisHandle Ignore - File Content empty pos1 ${file_path}`);
                            return mes;
                        }
                    } catch(err) {
                        //safely ignore
                        kutil.Kaudit.Logger.trace(`AnalysisHandle Read file contents failed pos1 - ${file_path}`);
                        return mes;
                    }
                }

                if(!filelang){
                    kutil.Kaudit.Logger.error(`AnalysisHandle May Exist Bug - don't know reason why can't determine file lang`);
                    return mes;
                } 

                if(!content){
                    //here mean we never read content,try init content and lines
                    try {
                        content = await kutil.Kaudit.Helper.asynReadfile(file_path);
                        if (content) {
                            lines = content.toString().split(config.Kaudit.Config.defaultLineSeparator);
                        }
                        if(lines.length == 0){
                            kutil.Kaudit.Logger.trace(`AnalysisHandle Ignore - File Content empty pos2 ${file_path}`);
                            return mes;
                        }
                    } catch(err) {
                        //safely ignore
                        kutil.Kaudit.Logger.trace(`AnalysisHandle Read file contents failed pos2 - ${file_path}`);
                        return mes;
                    }
                }

                // doMatch
                Analysis.doMatch(filelang, file_path, content, lines);            

            }else if(file_state.isDirectory()){
                // do nothing
            }

            return mes;    
        }

        private static doMatch(file_lang:string , file_path:string, content:string, lines:string[],){
            var regRules = krule.Kaudit.RegRules.getOrderedRegexRules().get(file_lang);
            if(regRules){
                let filepathAnalysisRecords: AnalysisRecord[] | undefined =  Analysis.filePath2AnalysisRecords.get(file_path);
                let groupName2AnalysisRecordsMap = Analysis.lang_groupName2AnalysisRecordsMap.get(file_lang);
                for (let i=0;i<lines.length;i++) {
                    for(let rule of regRules){
                        let res = lines[i].match(rule.regex);
                        if(res && res.length > 0){
                            // check regex_match_cond
                            let condMatch:any = Analysis.doConditionMatch(rule,file_path,content,lines,i);
                            let pass = true;
                            if(condMatch){
                                pass= condMatch["pass"];
                            }
                            if(pass){
                                // now can generate AnalysisRecord
                                for (let match of res) {
                                    let start = 0;
                                    let end = 0;
                                    start = lines[i].indexOf(match, start);
                                    if (start > -1) {
                                        end = start + match.length;
                                        let mb = new MatchBase(rule, file_path, match, i, start, i, end);
                                        let ar = new AnalysisRecord(mb, condMatch);
                                        if(!filepathAnalysisRecords){
                                            filepathAnalysisRecords = [];
                                            Analysis.filePath2AnalysisRecords.set(file_path, filepathAnalysisRecords);
                                        }
                                        filepathAnalysisRecords.push(ar);
                                        if(!groupName2AnalysisRecordsMap){
                                            groupName2AnalysisRecordsMap = new Map<string,AnalysisRecord[]>();
                                            Analysis.lang_groupName2AnalysisRecordsMap.set(file_lang, groupName2AnalysisRecordsMap);
                                        }
                                        let groupnameAnalysisRecords = groupName2AnalysisRecordsMap.get(rule.group_name);
                                        if(!groupnameAnalysisRecords){
                                            groupnameAnalysisRecords = [];
                                            groupName2AnalysisRecordsMap.set(rule.group_name,groupnameAnalysisRecords);
                                        }
                                        groupnameAnalysisRecords.push(ar);
                                    }else{
                                        kutil.Kaudit.Logger.trace(`doMatch - Can't find the math content from line ${i} of ${file_path}`);
                                    }
                                }
                            }
                        }
                    }
                }
            }else{
                kutil.Kaudit.Logger.warn(`doMatch - Can't find ${file_lang} RegRules of ${file_path}`);
            }
        }

        private static doConditionMatch(rule: krule.Kaudit.RegRule, file_path:string, content:string, lines:string[], currentLine:number){
            //           regex_match_cond : { pass:boolean, context_aware_match:any}
            //                                context_aware_match:{ pass:boolean, match_mode:string, context_aware_rules:any }
            //                                                      context_aware_rules: { anyKeyName1ofContext_aware_rules:any }
            //                                                                             anyKeyName1ofContext_aware_rules: { pass:boolean, match_mode:string, cond_rules:any }
            //                                                                                                                 cond_rules: { anyKeyName11ofCond_rules:any }
            //
            
            let regex_match_cond:any = {};
            if(rule.regex_match_cond){
                let rule_context_aware_match = rule.regex_match_cond[krule.Kaudit.RegexMatchCond.context_aware_match];
                if(rule_context_aware_match){
                    let context_aware_match:any = {};
                    regex_match_cond[krule.Kaudit.RegexMatchCond.context_aware_match] = context_aware_match;
                    let rule_match_mode = rule_context_aware_match[krule.Kaudit.RegexMatchCond.match_mode];
                    let rule_context_aware_rules = rule_context_aware_match[krule.Kaudit.RegexMatchCond.context_aware_rules];
                    if(rule_context_aware_rules){
                        context_aware_match[krule.Kaudit.RegexMatchCond.match_mode] = rule_match_mode;
                        let context_aware_rules:any = {};
                        context_aware_match[krule.Kaudit.RegexMatchCond.context_aware_rules] = context_aware_rules;
                        let count_context_aware_rules = 0;
                        let pass_context_aware_rules:boolean|undefined = undefined; //used for determine context_aware_rules "match result" with match mode
                        for(let key_rule_context_aware_rules in rule_context_aware_rules){
                            count_context_aware_rules++;
                            // in context_aware_rules now
                            let value_rule_context_aware_rules = rule_context_aware_rules[key_rule_context_aware_rules];
                            let count_condition_rules = 0;
                            let pass_cond_rules:boolean|undefined = undefined; //used for determine rule_cond_rules "match result" with match mode
                            if(value_rule_context_aware_rules){
                                let toInsertValue_of_key_rule_context_aware_rules:any = {};
                                context_aware_rules[key_rule_context_aware_rules] = toInsertValue_of_key_rule_context_aware_rules;
                                let rule_range_begin:number = value_rule_context_aware_rules[krule.Kaudit.RegexMatchCond.range_begin];
                                let rule_range_end:number = value_rule_context_aware_rules[krule.Kaudit.RegexMatchCond.range_end]; 
                                let line_begin =  rule_range_begin +  currentLine;
                                let line_end = rule_range_end + currentLine;
                                if(line_begin < 0){//limit begin
                                    line_begin = 0;
                                }
                                if(line_end > lines.length-1){//limit end
                                    line_end = lines.length-1;
                                }      
                                let rule_context_aware_rule_match_mode = value_rule_context_aware_rules[krule.Kaudit.RegexMatchCond.match_mode];
                                let rule_cond_rules =  value_rule_context_aware_rules[krule.Kaudit.RegexMatchCond.cond_rules];
                                toInsertValue_of_key_rule_context_aware_rules[krule.Kaudit.RegexMatchCond.match_mode] = rule_context_aware_rule_match_mode;                                
                                if(rule_cond_rules){
                                    let cond_rules:any = {};
                                    toInsertValue_of_key_rule_context_aware_rules[krule.Kaudit.RegexMatchCond.cond_rules] = cond_rules;                                    
                                    for(let key_rule_cond_rules in rule_cond_rules){
                                        count_condition_rules++;
                                        let rule_cond_rule:RegExp = rule_cond_rules[key_rule_cond_rules];
                                        let cm: ConditionMatch|undefined = undefined;
                                        for(let j=line_begin; j<=line_end; j++){
                                            let res = lines[j].match(rule_cond_rule);
                                            if(res && res.length > 0){
                                                // now can generate ConditionMatch
                                                for (let match of res) {
                                                    let start = 0;
                                                    let end = 0;
                                                    start = lines[j].indexOf(match, start);
                                                    if (start > -1) {
                                                        end = start + match.length;
                                                        cm = new ConditionMatch(rule,file_path,match,j,start,j,end,key_rule_context_aware_rules,key_rule_cond_rules,true);
                                                        break;// in condition match, just only use the first match,do not consider others
                                                    }else{
                                                        kutil.Kaudit.Logger.trace(`doConditionMatch - Can't find the match content(${match}) from line ${j} of ${file_path} because of unknown reason`);
                                                    }
                                                }
                                            }
                                            if(cm !== undefined){
                                                break;
                                            }
                                        }                                                                            
                                        switch(rule_context_aware_rule_match_mode){
                                            case krule.Kaudit.MatchMode.all:
                                                if(cm === undefined){ // mean nolines match current rule_cond_rule
                                                   //fail                                                   
                                                   cm = new ConditionMatch(rule,file_path,`Fail - ${krule.Kaudit.MatchMode.all}, lines ${line_begin}-${line_end}`, line_begin, 0, line_end, lines[line_end].length, key_rule_context_aware_rules, key_rule_cond_rules, false);//false param indicate cm is fail reason
                                                   pass_cond_rules = false;
                                                }                                                                                            
                                                break;
                                            case krule.Kaudit.MatchMode.any:
                                                if(cm !== undefined){ // mean one line match current rule_cond_rule
                                                    //success
                                                    pass_cond_rules = true;
                                                }
                                                break;
                                            case krule.Kaudit.MatchMode.neg_all:
                                                if(cm !== undefined){ // mean one line match current rule_cond_rule
                                                    //fail
                                                    cm.pass = false;//modify cm.pass to indicate cm is fail reason
                                                    pass_cond_rules = false;
                                                }
                                                break;
                                            case krule.Kaudit.MatchMode.neg_any:
                                                if(cm === undefined){// mean one line match current rule_cond_rule
                                                    //at least one cond_rule no match in lines, so pass = true
                                                    cm = new ConditionMatch(rule,file_path,`Success - ${krule.Kaudit.MatchMode.neg_any}, lines ${line_begin}-${line_end}`, line_begin, 0, line_end, lines[line_end].length, key_rule_context_aware_rules, key_rule_cond_rules, true);
                                                    pass_cond_rules = true;
                                                }
                                                break;
                                            default:
                                                kutil.Kaudit.Logger.error(`Rules definition may exist promblem, possibly in ${rule.group_name} ${key_rule_context_aware_rules} ${key_rule_cond_rules}, you must check rules`);
                                                break;
                                        }  
                                        cond_rules[key_rule_cond_rules] = cm;                                         
                                        if(pass_cond_rules !== undefined){
                                            break;// mean judged, so break loop
                                        }
                                    }
                                    if(count_condition_rules > 0){
                                        if(pass_cond_rules === undefined){
                                            //need judge
                                            switch(rule_context_aware_rule_match_mode){
                                                case krule.Kaudit.MatchMode.all:
                                                    // No early failure mean success
                                                    pass_cond_rules = true;
                                                    break;
                                                case krule.Kaudit.MatchMode.any:
                                                    // No early success mean fail
                                                    pass_cond_rules = false;
                                                    break;
                                                case krule.Kaudit.MatchMode.neg_all:
                                                    // No early failure mean success
                                                    pass_cond_rules = true;
                                                    break;
                                                case krule.Kaudit.MatchMode.neg_any:
                                                    // No early success mean fail
                                                    pass_cond_rules = false;
                                                    break;
                                                default:
                                                    kutil.Kaudit.Logger.error(`Rules definition may exist promblem 1, possibly in ${rule.group_name} ${key_rule_context_aware_rules}, you must check rules`);
                                                    break;
                                            }
                                        }
                                    }
                                }
                            }
                            if(count_condition_rules == 0 && pass_cond_rules === undefined){
                                // mean no relative rule definition , just treated as no limit and print log
                                pass_cond_rules = true;
                                kutil.Kaudit.Logger.error(`Rules definition may exist promblem 2, possibly in ${rule.group_name} ${key_rule_context_aware_rules}, you must check rules`);
                            }                            
                            if(context_aware_rules[key_rule_context_aware_rules]){
                                context_aware_rules[key_rule_context_aware_rules]["pass"] = pass_cond_rules;
                                switch(rule_match_mode){
                                    case krule.Kaudit.MatchMode.all:
                                        if(pass_cond_rules === false){ // mean current context_aware_rule match fail
                                           //fail                                        
                                           pass_context_aware_rules = false;
                                        }                                                                                            
                                        break;
                                    case krule.Kaudit.MatchMode.any:
                                        if(pass_cond_rules === true){ // mean current context_aware_rule match success
                                            //success
                                            pass_context_aware_rules = true;
                                        }
                                        break;
                                    case krule.Kaudit.MatchMode.neg_all:
                                        if(pass_cond_rules === true){ // mean current context_aware_rule match fail
                                            //fail
                                            pass_context_aware_rules = false;
                                        }
                                        break;
                                    case krule.Kaudit.MatchMode.neg_any:
                                        if(pass_cond_rules === false){// mean current context_aware_rule match success                                            
                                            pass_context_aware_rules = true;
                                        }
                                        break;
                                    default:
                                        kutil.Kaudit.Logger.error(`Rules definition may exist promblem 3, possibly in ${rule.group_name} ${key_rule_context_aware_rules}, you must check rules`);
                                        break;
                                }
                            }else{
                                kutil.Kaudit.Logger.error(`Rules definition may exist promblem 4, possibly in ${rule.group_name} ${key_rule_context_aware_rules}, you must check rules`);
                            }
                            if(pass_context_aware_rules !== undefined){
                                break;
                            }
                        }
                        if(count_context_aware_rules > 0){
                            if(pass_context_aware_rules === undefined){
                                //need judge
                                switch(rule_match_mode){
                                    case krule.Kaudit.MatchMode.all:
                                        // No early failure mean success
                                        pass_context_aware_rules = true;
                                        break;
                                    case krule.Kaudit.MatchMode.any:
                                        // No early success mean fail
                                        pass_context_aware_rules = false;
                                        break;
                                    case krule.Kaudit.MatchMode.neg_all:
                                        // No early failure mean success
                                        pass_context_aware_rules = true;
                                        break;
                                    case krule.Kaudit.MatchMode.neg_any:
                                        // No early success mean fail
                                        pass_context_aware_rules = false;
                                        break;
                                    default:
                                        kutil.Kaudit.Logger.error(`Rules definition may exist promblem 1, possibly in ${rule.group_name}, you must check rules`);
                                        break;
                                }
                            }
                        }
                        if(count_context_aware_rules == 0 && pass_context_aware_rules === undefined){
                            // mean no relative rule definition , just treated as no limit and print log
                            pass_context_aware_rules = true;
                            kutil.Kaudit.Logger.error(`Rules definition may exist promblem 2, possibly in ${rule.group_name}, you must check rules`);
                        }
                        context_aware_match["pass"] = pass_context_aware_rules;                                              
                    }
                    if(context_aware_match["pass"] !== undefined){
                        regex_match_cond["pass"] = context_aware_match["pass"];// now just copy value
                    }else{
                        // just print error and let pass = true;
                        regex_match_cond["pass"] = true;
                        kutil.Kaudit.Logger.error(`Rules definition may exist promblem 3, possibly in ${rule.group_name}, you must check rules`);
                    }                 
                }else{
                    // just print error and let pass = true;
                    regex_match_cond["pass"] = true;
                    kutil.Kaudit.Logger.error(`Rules definition may exist promblem 4, possibly in ${rule.group_name}, you must check rules`);
                }                
            }else{
                regex_match_cond["pass"] = true;
            }
            return regex_match_cond;
        }

        private static doSort(){

            for(let analysisRecords of Analysis.filePath2AnalysisRecords.values()){
                // sort by line / column / order / regex
                analysisRecords.sort(Analysis.sortByLineNumThanColumnThenOrderThanRegex);
            }

            for(let groupName2AnalysisRecordsMap of Analysis.lang_groupName2AnalysisRecordsMap.values()){
                for(let analysisRecords of groupName2AnalysisRecordsMap.values()){
                    // sort by order first, then by filename of basename, then by filename of absname, then by match line, then regex
                    analysisRecords.sort(Analysis.sortByOrderThenFileNameThanMatchLineThanRegex);  
                }
            }
        }

        private static sortByLineNumThanColumnThenOrderThanRegex(a:AnalysisRecord ,b: AnalysisRecord){
            if(a.regex.matchLineNumStart < b.regex.matchLineNumStart){
                return -1;
            }else if(a.regex.matchLineNumStart > b.regex.matchLineNumStart){
                return 1;
            }else{
                if(a.regex.startColumn < b.regex.startColumn){
                    return -1;
                }else if (a.regex.startColumn > b.regex.startColumn){
                    return 1;
                }else{
                    if(a.regex.matchLineNumEnd < b.regex.matchLineNumEnd){
                        return -1;
                    }else if(a.regex.matchLineNumEnd > b.regex.matchLineNumEnd){
                        return 1;
                    }else{
                        if(a.regex.endColumn < b.regex.endColumn){
                            return -1;
                        }else if (a.regex.endColumn > b.regex.endColumn){
                            return 1;
                        }else{
                            if(a.regex.rule.order < b.regex.rule.order){
                                return -1;
                            }else if(a.regex.rule.order > b.regex.rule.order){
                                return 1;
                            }else{
                                // then sort by regex
                                let areg = a.regex.toString();
                                let breg = b.regex.toString();
                                if(areg < breg){
                                    return -1;
                                }else if(areg > breg){
                                    return 1;
                                }else{
                                    return 0;
                                }
                            }
                        }
                    }
                }
            }
        }

        private static sortByOrderThenFileNameThanMatchLineThanRegex(a:AnalysisRecord ,b: AnalysisRecord){
            if(a.regex.rule.order < b.regex.rule.order){
                return -1;
            }else if(a.regex.rule.order > b.regex.rule.order){
                return 1;
            }else{
                let aName = path.basename(a.regex.matchFilePath);
                let bName = path.basename(b.regex.matchFilePath);
                if(aName < bName){
                    return -1;
                }else if(aName > bName){
                    return 1;
                }else{
                    // then sort by absname
                    if(a.regex.matchFilePath < b.regex.matchFilePath){
                        return -1;
                    }else if(a.regex.matchFilePath > b.regex.matchFilePath){
                        return 1;
                    }else{
                        // then sort by line num
                        if(a.regex.matchLineNumStart < b.regex.matchLineNumStart){
                            return -1;
                        }else if(a.regex.matchLineNumStart > b.regex.matchLineNumStart){
                            return 1;
                        }else{
                            // then sort by regex
                            let areg = a.regex.toString();
                            let breg = b.regex.toString();
                            if(areg < breg){
                                return -1;
                            }else if(areg > breg){
                                return 1;
                            }else{
                                return 0;
                            }    
                        }                                    
                    }
                }
            }                      
        }

        private static doOutputStatistic(){
            //Statistic:
            //  for / lang num match success
            for(let lang of config.Kaudit.Config.getSupportProgramLangs().keys()){
                let groupName2AnalysisRecordsMap = Analysis.lang_groupName2AnalysisRecordsMap.get(lang);
                if(groupName2AnalysisRecordsMap){
                    let count:number = 0;
                    for(let entry of groupName2AnalysisRecordsMap.entries()){
                        kutil.Kaudit.Logger.info(`${lang} - ${entry[1].length} ${entry[0]} record match success`);
                        count = count + entry[1].length;
                        let prev:AnalysisRecord|undefined = undefined;
                        let orderCount = 0;
                        for(let ar of entry[1]){
                            if(prev == undefined){
                                prev = ar;
                                orderCount = 0;
                            }
                            if(prev.regex.rule.order == ar.regex.rule.order){
                                orderCount++;                                
                            }else{
                                let langspace = '';
                                for(let c of lang){
                                    langspace = langspace + " ";
                                }
                                kutil.Kaudit.Logger.debug(`${langspace}       ${orderCount} Order=${prev.regex.rule.order} record match success`);
                                prev = ar;
                                orderCount=0;
                            }
                        }
                    }
                    kutil.Kaudit.Logger.info(`${lang} - Total ${count} ${lang} record match `);
                }
            }
        }

    }

    export class MatchBase {
        rule: krule.Kaudit.RegRule;
        matchFilePath: string;
        matchContent: string;
        matchLineNumStart: number;
        startColumn: number;
        matchLineNumEnd:number;
        endColumn: number;

        constructor(rule :krule.Kaudit.RegRule, filePath: string, matchContent: string, matchLineNumStart:number, startColumn:number, matchLineNumEnd:number, endColumn:number) {
            this.rule = rule;
            this.matchFilePath = filePath;
            this.matchContent = matchContent;
            this.matchLineNumStart = matchLineNumStart;
            this.startColumn = startColumn;
            this.matchLineNumEnd = matchLineNumEnd;
            this.endColumn = endColumn;
        }

        public navigateToCode(){
            try{
                let fileUri : vscode.Uri = vscode.Uri.file(this.matchFilePath);
                let startLine = this.matchLineNumStart;
                let startColumn = this.startColumn;
                let endLine = this.matchLineNumEnd;
                let endColumn = this.endColumn;

                vscode.workspace.openTextDocument(fileUri).then((doc) => {
                    vscode.window.showTextDocument(doc).then(async (editor) => {
                        if (vscode.window.activeTextEditor) {
                            // We define the selection from the element.
                            const selection = new vscode.Selection(startLine, startColumn, endLine, endColumn);            
                            // Set the selection.
                            vscode.window.activeTextEditor.selection = selection;
                            vscode.window.activeTextEditor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
                        }
                    });
                });
            }catch(ex){
                kutil.Kaudit.Logger.error(`Can't navigate because of ${ex}`);
            }
        }
    }
   
    export class AnalysisRecord {
        //{ pass:boolean, regex:MatchBase, regex_match_cond:any }
        //           regex_match_cond : { pass:boolean, context_aware_match:any}
        //                                context_aware_match:{ pass:boolean, match_mode:string, context_aware_rules:any }
        //                                                      context_aware_rules: { anyKeyName1ofContext_aware_rules:any }
        //                                                                             anyKeyName1ofContext_aware_rules: { pass:boolean, match_mode:string, cond_rules:any }
        //                                                                                                                 cond_rules: { anyKeyName11ofCond_rules:any }
        //                                                                                                                               anyKeyName11ofCond_rules:{ ConditionMatch }
        
        pass:boolean;
        regex:MatchBase;
        regex_match_cond:any;

        constructor(mainMatch:MatchBase, conditionMatch:any){
            this.regex = mainMatch;
            this.regex_match_cond = conditionMatch;
            this.pass = true;
            if(conditionMatch){
                if(conditionMatch["pass"]){
                    this.pass = true;
                }else{
                    this.pass = false;
                }
            }
        }

        public getAllMatchInfo(){
            let allInfo = JSON.stringify(this,  (key, value)=>{
                if(value instanceof RegExp){
                    return value.toString();
                }
                return value;
            }, 4);
            return allInfo;
        }

    }

    export class ConditionMatch extends MatchBase {

        keyNameOfContext_Aware_Rules:string;
        keyNameOfCond_Rules:string;
        pass:boolean;

        constructor(rule :krule.Kaudit.RegRule, filePath: string, matchContent: string, matchLineNumStart:number, startColumn:number, matchLineNumEnd:number, endColumn:number,
            keyNameOfContext_Aware_Rules:string,keyNameOfCond_Rules:string, pass:boolean) {
            super(rule, filePath, matchContent, matchLineNumStart, startColumn, matchLineNumEnd, endColumn);
            this.keyNameOfContext_Aware_Rules = keyNameOfContext_Aware_Rules;
            this.keyNameOfCond_Rules = keyNameOfCond_Rules;
            this.pass = pass;
        }        
    }

}