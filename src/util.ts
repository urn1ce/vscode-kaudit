import * as vscode from "vscode";
import * as path from "path";
import * as util from "util";
import * as fs from "fs";
import * as config from "./config";

export namespace Kaudit {

    export enum LoggerLevel {
        error = 1,
        warn = 2,
        info = 3,
        debug = 4,
        trace = 5,       
    }

    export class Logger {
        private static outputChannel : vscode.OutputChannel = vscode.window.createOutputChannel("Kaudit");
        public static logLevel:LoggerLevel = LoggerLevel.info;

        //TODO: add color to outputchannel

        public static error(msg : string, showErrorDialog : boolean = false): void {
            if(Logger.logLevel >= LoggerLevel.error){
                // Prefix the error
                msg = `Error: ${msg}`;

                // Output the error to console
                Logger.outputChannel.appendLine(msg);

                // Show our error dialog if desired
                if (showErrorDialog) {
                    vscode.window.showErrorMessage(msg);
                }

                // Show our output channel
                Logger.show();
            }
        }

        public static warn(msg : string, showWarnDialog : boolean = false): void {
            if(Logger.logLevel >= LoggerLevel.warn){
                msg = `WARN: ${msg}`;
                // Output the info to console
                this.outputChannel.appendLine(msg);

                // Show our error dialog if desired
                if (showWarnDialog) {
                    vscode.window.showWarningMessage(msg);
                }
            }
        }

        public static info(msg : string): void {
            if(Logger.logLevel >= LoggerLevel.info){
                // Output the info to console
                this.outputChannel.appendLine(`INFO: ${msg}`);
            }
        }

        public static debug(msg : string): void {
            if(Logger.logLevel >= LoggerLevel.debug){
                // Output the info to console
                this.outputChannel.appendLine(`DEBUG: ${msg}`);
            }
        }

        public static trace(msg : string): void {
            if(Logger.logLevel >= LoggerLevel.trace){
                // Output the info to console
                this.outputChannel.appendLine(`TRACE: ${msg}`);
            }
        }

        public static show() : void {
            // Reveal this channel in the UI.
            Logger.outputChannel.show();
        }
    }

    export class Helper {
        public static readdir = util.promisify(fs.readdir);
        public static fstat = util.promisify(fs.stat);
        public static asynReadfile = util.promisify(fs.readFile);

        //traverse path_dir recursive, with Filter(determine whether handle dir/file) and Handler(handle dir/file)
        public static async traverseRecursiveWithFilterAndHandler(
            path_dir:string, 
            shared_map:Map<any,any> = new Map<any,any>(), 
            handle:(file_path:string, file_state:fs.Stats, shared_map:Map<any,any>)=>Promise<string> = async function(file_path:string,file_state:fs.Stats, shared_map:Map<any,any>): Promise<string>{
                //if there is some error, handle will return not empty string,which will show in OutputChannel
                //default return ""
                return "";    
            },
            filter:(file_path:string, file_state:fs.Stats, shared_map:Map<any,any>)=>Promise<boolean> = async function(file_path:string, file_state:fs.Stats, shared_map:Map<any,any>): Promise<boolean>{
                //for dir, filter affect whether continue traverse dir and handle dir. false: traverse and handle, true: not traverse and not handle
                //for file, filter affect whether handle file. false: handle file, true: not handle file

                // file_path could not in excludePatterns
                for(let pat of config.Kaudit.Config.excludePatterns){
                    if(file_path.match(pat)){
                        return true;
                    }
                }

                // here a default handle                
                // not follow symbolicLink
                if(file_state.isSymbolicLink()){
                    return true;
                }
                return false;
            }){
            
            let error: string = '';
            try{

                // path_dir could not in excludePatterns
                for(let pat of config.Kaudit.Config.excludePatterns){
                    if(path_dir.match(pat)){
                        return error;
                    }
                }
                let files = await Helper.readdir(path_dir); 
                if (files && files.length) {
                    for (let filename of files) {
                        let absPath = path.join(path_dir, filename);
                        let filestat = await Helper.fstat(absPath);
                    
                        if (filestat) {
                            if(await filter(absPath, filestat, shared_map)){
                                continue;
                            }else{
                                let msg = await handle(absPath, filestat, shared_map);
                                if(msg !== ""){
                                    Logger.error(msg);
                                }
                            }
                            if (filestat.isDirectory()) {
                                await Helper.traverseRecursiveWithFilterAndHandler(absPath,shared_map,handle,filter);
                            }                           
                        }
                    }
                }
            } catch(err) {
                error = String(err);
                Logger.error(error);
            }     
            return error;                   
        } 
        
        // use for translating maudit rules to krule
        public static translateMauditRule2KauditRule(){

            //you can get maudit rules from vscode-maudit project, and copy them in config/maudit_rules
            let fromDir = path.join(__dirname, "..","config", "maudit_rules");
            let toFile = path.join(__dirname, "..","config", "temp.json");
            // because php/perl/python maudit rule 'quality' better than java rule,so we just move java order to end
            let progLangs = ['php', 'perl', 'python','java']

            let resObj:any = {};
            for(let proglang of progLangs){
                let fileEn = path.join(fromDir,`${proglang}.en.json`);
                let fileZh = path.join(fromDir,`${proglang}.zh.json`);
                let enObj:any[] = require(fileEn);
                let zhObj:any[] = require(fileZh);
                let reg2ruleEn = new Map<string,any>();
                let reg2ruleZh = new Map<string,any>();
                for(let rule of enObj){
                    let regex = rule["regex"];
                    reg2ruleEn.set(regex,rule);
                }
                for(let rule of zhObj){
                    let regex = rule["regex"];
                    reg2ruleZh.set(regex,rule);
                }
                if(reg2ruleEn.size !- reg2ruleZh.size){
                    console.log(`${proglang} - rules size not equal`);
                    continue;
                }
                for(let entry of reg2ruleZh){
                    let mapEnRule = reg2ruleEn.get(entry[0]);
                    if(!mapEnRule){
                        console.log(`${proglang} - Can't find map of ${entry[0]}`);
                        continue;
                    }
                    let arr = resObj[proglang];
                    if(!arr){
                        arr = [];
                        resObj[proglang] = arr;
                    }
                    let toPushObj:any = { 
                        "group_name": mapEnRule["type_name"],
                        "regex":mapEnRule["regex"],
                        "regex_flag":"ig",
                        "regex_match_cond":{},
                        "order":1000,
                        "view_info":{
                            "en":{
                                "name": mapEnRule["type_name"],           
                                "description": mapEnRule["description"],
                                "detail_url": ""
                            },
                            "zh":{
                                "name": entry[1]["type_name"],
                                "description": entry[1]["description"],
                                "detail_url": ""
                            }
                        }
                    };
                    arr.push(toPushObj);
                }
                //sort by group name, make same group name together 
                let arr:any[] = resObj[proglang];
                if(arr){
                    arr.sort((a, b) =>{
                        if(a["group_name"] < b["group_name"]){
                            return -1;
                        }else if(a["group_name"] > b["group_name"]){
                            return 1;
                        }else{
                            return 0;
                        }
                    })
                }              
            }

            //write file
            fs.writeFileSync(toFile,JSON.stringify(resObj,null,4));
            console.log(JSON.stringify(resObj,null,4));

            //you need beautify your result ,and adjust order of rules by your prefer, save then as *krule.json
            //default_krule.json translate from maudit_rules,and do modify
              
        }

    } 

}