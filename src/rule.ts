import * as config from "./config";
import * as kutil from "./util";
import * as fs from "fs";
import * as path from "path";

export namespace Kaudit {
    
    export interface RegRuleInterface {
        group_name : string;
        regex: string;
        regex_flag: string;
        regex_match_cond: any;
        order:number;
        view_info: any;
    }

    //define regex_match_cond rel key
    export enum RegexMatchCond {
        regex_match_cond = "regex_match_cond",
        context_aware_match = "context_aware_match",
        context_aware_rules = "context_aware_rules",
        match_mode = "match_mode",
        range_begin = "range_begin",
        range_end = "range_end",
        cond_rules = "cond_rules",
        cond_rules_flag = "cond_rules_flag"
    }

    //match_mode
    //all mean all need match then return true, else false
    //any mean any one match then return true, else false
    //!all mean all no match then return true, else false
    //!any mean any one no match then return true, else false
    export enum MatchMode {
        all = "all",
        any = "any",
        neg_all = "!all",
        neg_any = "!any"
    }
    

    export class RegRule {

        public static rangeMin:string = "-2147483648";//int min, limit context_aware range
        public static rangeMax:string = "2147483647";//int max, limit context_aware range

        group_name : string;
        regex: RegExp;
        regex_match_cond: any;
        order: number;
        view_info: any;
        apply_lang: string;
        constructor (rawRule : RegRuleInterface,  apply_lang:string) {
            this.group_name = rawRule.group_name;
            this.regex = new RegExp(rawRule.regex, rawRule.regex_flag);  //flags e.g.  i: ignore case / g: find all matches
            let exist = false;
            if(rawRule.regex_match_cond){
                let context_aware_match = rawRule.regex_match_cond[RegexMatchCond.context_aware_match];
                if(context_aware_match){//just translate raw str rule to regex obj rule                   
                    let context_aware_rules = context_aware_match[RegexMatchCond.context_aware_rules];
                    if(context_aware_rules){
                        for(let key_context_aware_rule in context_aware_rules){//traverse object use in
                            let context_aware_rule = context_aware_rules[key_context_aware_rule];
                            if(context_aware_rule){
                                let range_begin:string = "";
                                let range_end:string = "";
                                //use value === undefined || value === null to compare undefined or null
                                if(context_aware_rule[RegexMatchCond.range_begin] === undefined){
                                    kutil.Kaudit.Logger.error(`Rule ${rawRule.group_name} exist error, range_begin is not defined, treated as empty string(mean file begin), you must check rules`);                                   
                                }else{
                                    range_begin = context_aware_rule[RegexMatchCond.range_begin];
                                }
                                if(context_aware_rule[RegexMatchCond.range_end] === undefined){
                                    kutil.Kaudit.Logger.error(`Rule ${rawRule.group_name} exist error, range_end is not defined, treated as empty string(mean file end), you must check rules`);
                                }else{
                                    range_end = context_aware_rule[RegexMatchCond.range_end];
                                }
                                if(range_begin.trim() == ""){
                                    range_begin = RegRule.rangeMin;
                                }
                                if(range_end.trim() == ""){
                                    range_end = RegRule.rangeMax;
                                }
                                let range_begin_int:number = parseInt(range_begin);
                                let range_end_int:number = parseInt(range_end);
                                let rangeMinInt = parseInt(RegRule.rangeMin);
                                let rangeMaxInt = parseInt(RegRule.rangeMax);
                                if(range_begin.trim() != "" && isNaN(range_begin_int)){
                                    kutil.Kaudit.Logger.error(`Rule ${rawRule.group_name} exist error, range_begin(${range_begin}) is not empty string or int-like string, treated as empty string(mean file begin), you must check rules`);
                                    range_begin_int = rangeMinInt;
                                }
                                if(range_end.trim() !="" && isNaN(range_end_int)){
                                    kutil.Kaudit.Logger.error(`Rule ${rawRule.group_name} exist error, range_end(${range_end}) is not empty string or int-like string, treated as empty string(mean file end), you must check rules`);
                                    range_end_int = rangeMaxInt;
                                }
                                if(range_begin_int < rangeMinInt){
                                    kutil.Kaudit.Logger.error(`Rule ${rawRule.group_name} exist error, range_begin(${range_begin}) less than defaultMin(${rangeMinInt}), treated as ${rangeMinInt}, you must check rules`);
                                    range_begin_int = rangeMinInt;
                                }
                                if(range_end_int > rangeMaxInt){
                                    kutil.Kaudit.Logger.error(`Rule ${rawRule.group_name} exist error, range_end(${range_end}) larger than defaultMax(${rangeMaxInt}), treated as ${rangeMaxInt}, you must check rules`);
                                    range_end_int = rangeMaxInt;
                                }
                                //overwrite , str -> number
                                context_aware_rule[RegexMatchCond.range_begin] = range_begin_int;
                                context_aware_rule[RegexMatchCond.range_end] = range_end_int;   
                                let new_cond_rules:any = {};                             
                                if(context_aware_rule[RegexMatchCond.cond_rules]){
                                    let cond_rules = context_aware_rule[RegexMatchCond.cond_rules];                    
                                    for(let key_cond_rules in cond_rules){
                                        let flag = "ig";
                                        let check_flag = true;
                                        if(context_aware_rule[RegexMatchCond.cond_rules_flag]){
                                            if(context_aware_rule[RegexMatchCond.cond_rules_flag][key_cond_rules]){
                                                flag = context_aware_rule[RegexMatchCond.cond_rules_flag][key_cond_rules];
                                            }else{
                                                check_flag = false;
                                            }
                                        }else{
                                            check_flag = false;
                                        }
                                        if(!check_flag){
                                            kutil.Kaudit.Logger.error(`Rule ${rawRule.group_name} exist error, ${key_cond_rules} doesn't exist regex flag in ${RegexMatchCond.cond_rules_flag}, program use the 'ig' temporarily, you must check rules`);
                                        }
                                        if(cond_rules[key_cond_rules]){
                                            new_cond_rules[key_cond_rules] = RegExp(cond_rules[key_cond_rules],flag);
                                        }else{
                                            kutil.Kaudit.Logger.error(`Rule ${rawRule.group_name} exist error, ${key_cond_rules} doesn't have value, program will skip it, you must check rules`);
                                            continue;
                                        }
                                    }                                     
                                }
                                context_aware_rule[RegexMatchCond.cond_rules] = new_cond_rules;
                                exist = true;
                            }
                        }
                    }
                }
            }
            if(exist){
                this.regex_match_cond = rawRule.regex_match_cond;
            }else{
                this.regex_match_cond = undefined;
            }
            this.order = rawRule.order;
            this.view_info = rawRule.view_info;
            this.apply_lang = apply_lang;
        }
    }

    // export class Lang {
    //     name: string = "";
    //     description:string = "";
    //     detail_url:string = "";
    // }

    export class RegRules {

        private static regRuleMap: Map<string, RegRule[]> = new Map<string,RegRule[]>();//lang->ruleList
        private static default_config_path = path.join(__dirname, "..","config");//default rule dir
        private static default_rule_suffix_pattern = RegExp(".*krule\.json$", 'i');//require end with krule.json, ignore case

        public static getOrderedRegexRules(refresh = false): Map<string, RegRule[]> {   
            if(refresh){
                RegRules.regRuleMap.clear();
                //default Rules Handle
                if(!config.Kaudit.Config.disableDefaultRules){
                    let bakExcludePatterns = config.Kaudit.Config.excludePatterns;
                    // when search rules,we did not need excludePatterns
                    config.Kaudit.Config.excludePatterns = [];
                    kutil.Kaudit.Helper.traverseRecursiveWithFilterAndHandler(RegRules.default_config_path, RegRules.regRuleMap, RegRules.defaultRuleHandle);
                    config.Kaudit.Config.excludePatterns = bakExcludePatterns;
                }
                //custom Rules Handle
                if(config.Kaudit.Config.customRulesRaw){
                    RegRules.parseJSONObjRules(config.Kaudit.Config.customRulesRaw, RegRules.regRuleMap); 
                }

                //sort Rule by Order , if equal then GroupName,  if equal then regex
                for(let values of RegRules.regRuleMap.values()){
                    values.sort((a: RegRule, b: RegRule)=>{
                        if(a.order < b.order){
                            return -1;
                        }else if(a.order > b.order){
                            return 1;
                        }else{
                            if(a.group_name < b.group_name){
                                return -1;
                            }else if(a.group_name > b.group_name){
                                return 1;
                            }else{
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
                    })
                }             
            }        
            return RegRules.regRuleMap;
        }

        //handle when recursive traverse file
        private static async defaultRuleHandle(file_path:string, file_state:fs.Stats, shared_map:Map<any,any>):Promise<string> {

            if(file_state.isFile()){
                if(RegRules.default_rule_suffix_pattern.test(file_path)){
                    let rulesObj = require(file_path)      
                    RegRules.parseJSONObjRules(rulesObj, shared_map); 
                }
            }
            return "";
        }

        private static parseJSONObjRules(rulesObj:any, shared_map:Map<any,any>){
            let langnames = config.Kaudit.Config.getSupportProgramLangs();
            for (let lang of langnames.keys()) {
                let rules:RegRuleInterface[]|undefined = rulesObj[lang];
                if(rules){
                    let ruleList:RegRule[] = [];
                    if(shared_map.has(lang)){
                        ruleList = shared_map.get(lang);
                    }else{
                        shared_map.set(lang,ruleList);
                    }
                    for(let rule of rules){
                        let regRule = new RegRule(rule, lang);
                        ruleList.push(regRule);                        
                    }
                }
            }
        }    

    }

}