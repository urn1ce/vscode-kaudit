import * as vscode from "vscode";
import * as core from "./analysisCore"
import * as path from "path";
import * as config from "./config";
import * as krule from "./rule";

export namespace Kaudit {

    export class ExplorerNode extends vscode.TreeItem {
        
        public analysisRecord:core.Kaudit.AnalysisRecord | undefined = undefined;
        public parentNode : ExplorerNode|undefined = undefined;
        public childNodes : ExplorerNode[] = [];

        constructor(
            toHandle: core.Kaudit.AnalysisRecord | krule.Kaudit.RegRule|string,
            collapsibleState?: vscode.TreeItemCollapsibleState, mode:number = 0
        ) {
            let clabel = ""; 
            let ctooltip = "";
            if(toHandle instanceof core.Kaudit.AnalysisRecord){   
                // here is analysis node             
                if(mode == 0){
                    clabel = `${path.basename(toHandle.regex.matchFilePath)} : line ${toHandle.regex.matchLineNumStart+1}, column ${toHandle.regex.startColumn}`;
                    ctooltip = toHandle.regex.rule.regex.toString();
                    if(!collapsibleState){
                        collapsibleState = vscode.TreeItemCollapsibleState.None;
                    }
                }else if(mode == 1){
                    clabel = `${toHandle.regex.rule.view_info[config.Kaudit.Config.getLanguage()]["name"]} ${path.basename(toHandle.regex.matchFilePath)} : line ${toHandle.regex.matchLineNumStart+1}, column ${toHandle.regex.startColumn}`;
                    ctooltip = toHandle.regex.rule.regex.toString();
                }else{
                    clabel = "unknown";
                    ctooltip = "unknown"
                }
            }else if(toHandle instanceof krule.Kaudit.RegRule)
            {
                // here used for show group Name
                clabel = toHandle.view_info[config.Kaudit.Config.getLanguage()]["name"];
                let groupName2AnalysisRecordsMap = core.Kaudit.Analysis.lang_groupName2AnalysisRecordsMap.get(toHandle.apply_lang);
                if(groupName2AnalysisRecordsMap){
                    let analysisRecords = groupName2AnalysisRecordsMap.get(toHandle.group_name);
                    if(analysisRecords){
                        let cnt = 0;
                        for(let ar of analysisRecords){
                            if(ar.regex.rule.order == toHandle.order){
                                cnt++;
                            }
                        }
                        if(cnt > 0)
                            clabel = `${clabel} ${cnt}`
                    }
                }
                ctooltip = `${toHandle.group_name}  Order:${toHandle.order}`;
            }else
            {
                // here is not analysis node, it's type node used for classify
                clabel = toHandle;
            }
            super(clabel, collapsibleState);
            if(toHandle instanceof core.Kaudit.AnalysisRecord){
                this.analysisRecord = toHandle;
            }            
            this.tooltip = ctooltip;            
            this.command = {
                title: "",
                command: "kaudit.onClickExplorerNode",
                arguments: [this],
            };
        }

        // private static modifiedIcon = {
        //     light: path.join(__dirname, '..', 'resources', 'light', 'edit.svg'),
        //     dark: path.join(__dirname, '..', 'resources', 'dark', 'edit.svg')
        // }
        public refrehIcon(){
            // ever may want use icon to identify source code change
            // now I move this function to vscode.Diagnostic Warning info
            // so just return undefined
            // if(this.analysisRecord){
            //     // here is analysis node
            //     if(this.analysisRecord.isSync){
            //         this.iconPath = undefined;
            //     }else{
            //         this.iconPath = ExplorerNode.modifiedIcon;
            //     }                
            //     return;
            // }            
            this.iconPath = undefined;
        }

        public static onClick(node : ExplorerNode){
            if(node.analysisRecord){
                node.analysisRecord.regex.navigateToCode();
            }
            return;
        }
    }
    
    export class ExplorerNodeTreeDataProvider implements vscode.TreeDataProvider<ExplorerNode> {

        private onDidChangeTreeDataEmitter: vscode.EventEmitter<any> = new vscode.EventEmitter<any>();
        readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;//observer mode

        private rootNode: ExplorerNode = new ExplorerNode("By Lang&GroupName");

        public static explorerNodeTreeDataProvider :ExplorerNodeTreeDataProvider = new ExplorerNodeTreeDataProvider();

        private constructor(){}

        public async refreshByCurrentAnalysisRecords(): Promise<void> {
            
            //clear
            this.rootNode.childNodes = [];

            // construct tree nodes with Order:
            // order by lang def asc, then order by order field(if equal,then order by group name, then regex), then order by filename
            for(let lang of config.Kaudit.Config.getSupportProgramLangs().keys()){
                let groupName2AnalysisRecordsMap = core.Kaudit.Analysis.lang_groupName2AnalysisRecordsMap.get(lang);
                if(groupName2AnalysisRecordsMap && groupName2AnalysisRecordsMap.size > 0){
                    // only run here to create langNode
                    let langNode = new ExplorerNode(lang.toUpperCase(), vscode.TreeItemCollapsibleState.Expanded);
                    this.rootNode.childNodes.push(langNode);
                    langNode.parentNode = this.rootNode;

                    // these rules have ordered by order field / group name  / regex
                    let regRules = krule.Kaudit.RegRules.getOrderedRegexRules().get(lang);
                    if(regRules){
                        let preRuleGroupName:string | undefined = undefined;
                        let preOrder:number | undefined = undefined;                       
                        for(let regRule of regRules){
                            if(preRuleGroupName === undefined && preOrder === undefined){
                                preRuleGroupName = regRule.group_name;
                                preOrder = regRule.order;
                            }else{
                                if(preRuleGroupName != regRule.group_name || preOrder != regRule.order){
                                    preRuleGroupName = regRule.group_name;
                                    preOrder = regRule.order;
                                }else{
                                    continue;
                                }
                            }
                            // these records have sorted By OrderThenFileNameThanMatchLineThanRegex                           
                            let analysisRecords = groupName2AnalysisRecordsMap.get(regRule.group_name);
                            if(analysisRecords && analysisRecords.length > 0){
                                let notCreated = true;    
                                let groupNameNode:ExplorerNode = new ExplorerNode(regRule, vscode.TreeItemCollapsibleState.Collapsed);                                                     
                                for(let ar of analysisRecords){                                    
                                    if(ar.regex.rule.order == regRule.order) {
                                        if(notCreated){
                                            // only run here to append groupName Node
                                            langNode.childNodes.push(groupNameNode);
                                            groupNameNode.parentNode = langNode;  
                                            notCreated = false;
                                        }
                                        // create analysisRecord node
                                        let arNode = new ExplorerNode(ar, vscode.TreeItemCollapsibleState.None);
                                        groupNameNode.childNodes.push(arNode);
                                        arNode.parentNode = groupNameNode;                                       
                                    }else{
                                        continue;
                                    }                                    
                                }
                            }
                        }
                    }
                }                
            }
            
            //refresh tree view
            this.onDidChangeTreeDataEmitter.fire(null);

            //refresh ExplorerNodeDetailTreeDataProvider manually
            if(vscode.window.activeTextEditor){
                ExplorerNodeDetailTreeDataProvider.explorerNodeDetailTreeDataProvider.refresh(vscode.window.activeTextEditor.document.uri);
            }

        }        

        //will first call getChildren, then call getTreeItem for each
        //click node will not trigger this,only when onDidChangeTreeDataEmitter.fire
        getTreeItem(element: ExplorerNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
            if(element){
                element.refrehIcon();
            }
            return element;
        }
        getChildren(element?: ExplorerNode | undefined): vscode.ProviderResult<ExplorerNode[]> {
            let children : ExplorerNode[] = [];
            if (element) {
                children = element.childNodes;
            } else if (this.rootNode.childNodes.length !== 0) {
                children = this.rootNode.childNodes;
            }
            if (!element && children.length === 0) {
                return [new ExplorerNode("✎ No Analysis Results")];
            }
            return children;
        }
        getParent(element: ExplorerNode): vscode.ProviderResult<ExplorerNode> {
            return element.parentNode;
        }
    }

    export class ExplorerNodeDetailTreeDataProvider implements vscode.TreeDataProvider<ExplorerNode> {
        private onDidChangeTreeDataEmitter: vscode.EventEmitter<any> = new vscode.EventEmitter<any>();
        readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;//observer mode

        private rootNode: ExplorerNode = new ExplorerNode("By Line Order");

        public static explorerNodeDetailTreeDataProvider :ExplorerNodeDetailTreeDataProvider = new ExplorerNodeDetailTreeDataProvider();

        private constructor(){}
       
        public refresh(fileInfo:string|vscode.Uri|undefined) {

            if(fileInfo){
                let filePath = "";
                if(fileInfo instanceof vscode.Uri){
                    if(fileInfo.scheme !== "file"){
                        if(core.Kaudit.Analysis.filePath2AnalysisRecords.size == 0){
                            this.rootNode.childNodes = [];
                            this.onDidChangeTreeDataEmitter.fire(null);  
                        }
                        return;//not disk file
                    }
                    filePath = fileInfo.fsPath;
                }else{
                    filePath = fileInfo;
                }

                //clear
                this.rootNode.childNodes = [];

                //construct
                if(fileInfo){                
                    let analysisRecords = core.Kaudit.Analysis.filePath2AnalysisRecords.get(filePath);
                    // analysisRecords have sorted byLineNum Than Column Then Order Than Regex
                    if(analysisRecords){
                        for(let ar of analysisRecords){
                            let arNode = new ExplorerNode(ar, vscode.TreeItemCollapsibleState.None,1);
                            this.rootNode.childNodes.push(arNode);
                            arNode.parentNode = this.rootNode;
                        }
                    }                
                }

                //refresh tree view
                this.onDidChangeTreeDataEmitter.fire(null);  
            }            
        }         
        

        getTreeItem(element: ExplorerNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
            if(element){
                element.refrehIcon();
            }
            return element;
        }
        getChildren(element?: ExplorerNode | undefined): vscode.ProviderResult<ExplorerNode[]> {
            let children : ExplorerNode[] = [];
            if (element) {
                children = element.childNodes;
            } else if (this.rootNode.childNodes.length !== 0) {
                children = this.rootNode.childNodes;
            }
            if (!element && children.length === 0) {
                return [];
            }
            return children;
        }
        getParent(element: ExplorerNode): vscode.ProviderResult<ExplorerNode> {
            return element.parentNode;
        }
    }

    export class ExplorerNodeTreeView {

        private static treeView: vscode.TreeView<ExplorerNode>|undefined = undefined;

        public static getTreeView(){
            if(ExplorerNodeTreeView.treeView === undefined){
                ExplorerNodeTreeView.treeView = vscode.window.createTreeView("kaudit-explorer", { treeDataProvider: Kaudit.ExplorerNodeTreeDataProvider.explorerNodeTreeDataProvider });
            }
            return ExplorerNodeTreeView.treeView;
        }
    }

    export class ExplorerNodeDetailTreeView {

        private static treeView: vscode.TreeView<ExplorerNode>|undefined = undefined;

        public static getTreeView(){
            if(ExplorerNodeDetailTreeView.treeView === undefined){
                ExplorerNodeDetailTreeView.treeView = vscode.window.createTreeView("kaudit-explorer-detail", { treeDataProvider: Kaudit.ExplorerNodeDetailTreeDataProvider.explorerNodeDetailTreeDataProvider });
            }
            return ExplorerNodeDetailTreeView.treeView;
        }
    }
    

}