import { utils } from 'mocha';
import * as vscode from 'vscode';
import * as kutil from './util'

export namespace Kaudit {

    export class Config {

        // if no file extension and filesize <= checkFileLangOfFileSizeLimit, then try check file lang by first line with key php/java/python/perl check 
        public static checkFileLangOfFileSizeLimit:number = 512*1024;
        public static maxOneLineLength = 1024;
        public static checkFileLangFirstLineLengthLimit:number = 256;//Temporarily 256 bytes, and  and cannot be configured on the config panel, maybe change in future
        public static enableAutoFileLangDetect:boolean = true;
        public static defaultLineSeparator = '\n'; //we don't consider mac style file by default now
        private static lang2ext:Map<string, string[]> = new Map<string, string[]>();
        public static lang2detectkey:Map<string, RegExp[]> = new Map<string, RegExp[]>();
        public static disableDefaultRules = false;        
        public static customRulesRaw:any|undefined = undefined;//JSON Format
        public static analysisDirs:string[] = [];
        public static excludePatterns:RegExp[] = [];

        //refresh Config from UserSetting
        public static refreshConfigFromUserSetting(){

            let limit:number|undefined = vscode.workspace.getConfiguration().get("conf.Kaudit.checkFileLangOfFileSizeLimit");
            if(limit){
                Config.checkFileLangOfFileSizeLimit = limit;
            }else{
                Config.checkFileLangOfFileSizeLimit = 512*1024;
            }
            let moll:number|undefined = vscode.workspace.getConfiguration().get("conf.Kaudit.maxOneLineLength");
            if(moll){
                Config.maxOneLineLength = moll;
            }else{
                Config.maxOneLineLength = 1024;
            }
            let enable:boolean|undefined = vscode.workspace.getConfiguration().get("conf.Kaudit.enableAutoFileLangDetect");
            if(enable){
                Config.enableAutoFileLangDetect = true;
            }else{
                Config.enableAutoFileLangDetect = false;
            }

            let sep:string|undefined = vscode.workspace.getConfiguration().get("conf.Kaudit.lineSeparator");
            if(sep){
                switch(sep){
                    case "\\n":
                        Config.defaultLineSeparator = "\n";
                        break;
                    case "\\r\\n":
                        Config.defaultLineSeparator = "\r\n";
                        break;
                    case "\\r":
                        Config.defaultLineSeparator = "\r";
                        break;
                }
            }else{
                sep = '\n';
            }
            
            let l2e:any = vscode.workspace.getConfiguration().get("conf.Kaudit.supportLangs");
            Config.lang2ext.clear();
            Config.ext2lang.clear();
            if(l2e){
                for(let key in l2e){
                    let list:string[]|undefined = l2e[key];
                    let arr:string[] = [];
                    if(list){
                        arr = list;
                    }
                    if(arr.length > 0){
                        Config.lang2ext.set(key, arr);
                    }
                }
            }

            let l2dk:any = vscode.workspace.getConfiguration().get("conf.Kaudit.autoFileLangDetectKeyOfFirstLine");
            Config.lang2detectkey.clear();
            if(l2dk){
                for(let key in l2dk){
                    let list:string[]|undefined = l2dk[key];
                    let arr:string[] = [];
                    if(list){
                        arr = list;
                    }
                    if(arr.length > 0){
                        let regArr:RegExp[]  = []
                        for (const dk of arr) {
                            regArr.push(new RegExp(dk,"ig"));                            
                        }
                        Config.lang2detectkey.set(key, regArr);
                    }
                }
            }

            let rulesRaw:any = vscode.workspace.getConfiguration().get("conf.Kaudit.customRules");
            if(rulesRaw){
                Config.customRulesRaw = rulesRaw;
            }else{
                Config.customRulesRaw = {};
            }

            let disable:boolean|undefined = vscode.workspace.getConfiguration().get("conf.Kaudit.disableDefaultRules");
            if(disable){
                Config.disableDefaultRules = true;
            }else{
                Config.disableDefaultRules = false;
            }

            Config.analysisDirs = [];
            let dirs:string|undefined = vscode.workspace.getConfiguration().get("conf.Kaudit.analysisDirs");
            if(dirs && dirs.trim() !== ""){
                for( let dir of dirs.split(",")){
                    let index = dir.indexOf(':');
                    if(index > 0){
                        dir = dir.substring(0,index).toLocaleLowerCase() + dir.substring(index);
                    }
                    Config.analysisDirs.push(dir);
                }
            }

            Config.excludePatterns = [];
            let patterns:string|undefined = vscode.workspace.getConfiguration().get("conf.Kaudit.excludePatterns");
            if(patterns && patterns.trim() !== ""){
                for( let pattern of patterns.trim().split(",")){
                    try{
                        Config.excludePatterns.push(new RegExp(pattern,"ig"));
                    }catch(e: any){
                        kutil.Kaudit.Logger.error("please check your conf.Kaudit.excludePatterns," + e.toString());
                    }
                }
            }

            let logLevel:string|undefined = vscode.workspace.getConfiguration().get("conf.Kaudit.logLevel");
            if(logLevel){
                switch(logLevel){
                    case "error":
                        kutil.Kaudit.Logger.logLevel = kutil.Kaudit.LoggerLevel.error;
                        break;
                    case "warn":
                        kutil.Kaudit.Logger.logLevel = kutil.Kaudit.LoggerLevel.warn;
                        break;
                    case "info":
                        kutil.Kaudit.Logger.logLevel = kutil.Kaudit.LoggerLevel.info;
                        break;
                    case "debug":
                        kutil.Kaudit.Logger.logLevel = kutil.Kaudit.LoggerLevel.debug;
                        break;
                    case "trace":
                        kutil.Kaudit.Logger.logLevel = kutil.Kaudit.LoggerLevel.trace;
                        break;
                }
            }else{
                kutil.Kaudit.Logger.logLevel = kutil.Kaudit.LoggerLevel.info;
            }
        }

        public static getLanguage(): string{
            let lang = 'en';
            if (vscode.env.language === 'zh-cn') {
                lang = 'zh';
            }
            return lang;
        }

        public static getSupportProgramLangs() {
            if(Config.lang2ext.size == 0){
                //here lang must be lang id from https://code.visualstudio.com/docs/languages/identifiers, will use in getReadOnlyDocumentSelector4CodeDiagnostics
                //this is default behavior
                Config.lang2ext.set('java',['java']);
                Config.lang2ext.set('perl',['pl','pm']);
                Config.lang2ext.set('php',['php','php3','php4','php5','php7','pht','phtml']);
                Config.lang2ext.set('python',['py']);               
            }
            return Config.lang2ext;
        }

        private static ext2lang:Map<string, string> = new Map<string, string>();
        public static getExt2Lang() {
            if(Config.ext2lang.size == 0){
                let l2e = Config.getSupportProgramLangs();
                for(let key of l2e.keys()){
                    let exts = l2e.get(key);
                    if(exts){
                        for(let ext of exts) {
                            Config.ext2lang.set(ext, key);
                        }
                    }
                }
            }
            return Config.ext2lang;
        }

        public static getReadOnlyDocumentSelector4CodeDiagnostics(){
            let selectors = [];
            //limit AnalysisDiagnosticsProvider provideCodeActions only on these langs  
            for(let lang of Config.getSupportProgramLangs().keys()){
                selectors.push({ scheme: "file", language: lang });
            }
            let readOnlyDocumentSelector: vscode.DocumentSelector  = selectors;
            return readOnlyDocumentSelector;
        }

    }

}