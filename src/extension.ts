// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as core from "./analysisCore"
import * as viewTree from "./viewTree"
import * as codeDiagnostics from "./codeDiagnostics"
import * as config from "./config"
import * as path from "path";
import * as kutil from "./util";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// "when": "kauditCompatibleWorkspace" , make our panel visible
	vscode.commands.executeCommand("setContext", "kauditCompatibleWorkspace", true);

	//register command & component
	register(context);

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('kaudit is now active, enjoy!');

}

// This method is called when your extension is deactivated
export function deactivate() {}

function register(context: vscode.ExtensionContext){

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	// let disposableHello = vscode.commands.registerCommand('kaudit.hello', () => {
	// 	// The code you place here will be executed every time your command is executed
	// 	// Display a message box to the user
	// 	vscode.window.showInformationMessage('Hello from kaudit!');
	// });
	// context.subscriptions.push(disposableHello);

	// kutil.Kaudit.Helper.translateMauditRule2KauditRule();

	//TreeView Relation
	viewTree.Kaudit.ExplorerNodeTreeView.getTreeView();
	let analysisIsRunning = false;
	let disposableScanWorkspace = vscode.commands.registerCommand('kaudit.analyseWorkspace',async () => {
		if(!analysisIsRunning){
			analysisIsRunning = true;
			let progressOptions : vscode.ProgressOptions = {
				title: "Please wait while kaudit analysis is performed...",
				location: vscode.ProgressLocation.Notification,
				cancellable: false
			};
			vscode.window.withProgress(progressOptions, async (progress, token) => {
				await core.Kaudit.Analysis.analyze();
				await viewTree.Kaudit.ExplorerNodeTreeDataProvider.explorerNodeTreeDataProvider.refreshByCurrentAnalysisRecords();
				if(vscode.window.activeTextEditor){
					codeDiagnostics.Kaudit.AnalysisDiagnosticsProvider.refreshDocDiagnostics(vscode.window.activeTextEditor.document, codeDiagnostics.Kaudit.AnalysisDiagnosticsProvider.kruleAnalysisDiagnostics);
				}
				analysisIsRunning = false;
			});
		}
	});
	let disposableMatchInfoOfExplorerNodeTreeView = vscode.commands.registerCommand('kaudit.matchInfoOfExplorerNodeTreeView',async () => {
		if(viewTree.Kaudit.ExplorerNodeTreeView.getTreeView().selection.length > 0){
			let eNode = viewTree.Kaudit.ExplorerNodeTreeView.getTreeView().selection[0];
			if(eNode.analysisRecord){
				vscode.window.showInformationMessage(eNode.analysisRecord.getAllMatchInfo());
			}
		}
	});
	let disposableonClickExplorerNode = vscode.commands.registerCommand('kaudit.onClickExplorerNode',async (node: viewTree.Kaudit.ExplorerNode) => {
		viewTree.Kaudit.ExplorerNode.onClick(node);
	});
	viewTree.Kaudit.ExplorerNodeDetailTreeView.getTreeView();
	let disposableMatchInfoOfExplorerNodeDetailTreeView = vscode.commands.registerCommand('kaudit.matchInfoOfExplorerNodeDetailTreeView',async () => {
		if(viewTree.Kaudit.ExplorerNodeDetailTreeView.getTreeView().selection.length > 0){
			let eNode = viewTree.Kaudit.ExplorerNodeDetailTreeView.getTreeView().selection[0];
			if(eNode.analysisRecord){
				vscode.window.showInformationMessage(eNode.analysisRecord.getAllMatchInfo());
			}
		}
	});
	context.subscriptions.push(disposableScanWorkspace);
	context.subscriptions.push(disposableMatchInfoOfExplorerNodeTreeView);
	context.subscriptions.push(disposableonClickExplorerNode);
	context.subscriptions.push(disposableMatchInfoOfExplorerNodeDetailTreeView);
	
	//CodeDiagnostics Relation, you can install Error Lens to see Infomation
	codeDiagnostics.Kaudit.AnalysisDiagnosticsProvider.kruleAnalysisDiagnostics.clear();
	// codeDiagnostics.Kaudit.AnalysisDiagnosticsProvider.subscribeToDocumentChanges(context, codeDiagnostics.Kaudit.AnalysisDiagnosticsProvider.kruleAnalysisDiagnostics);
	//CodeDiagnostics Action Relation, in fact we did nothing, reserve
	let documentSelector = config.Kaudit.Config.getReadOnlyDocumentSelector4CodeDiagnostics();
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider(documentSelector, new codeDiagnostics.Kaudit.AnalysisDiagnosticsProvider())
	);

	// if (vscode.window.activeTextEditor) { // it doesn't need
	// 	codeDiagnostics.Kaudit.AnalysisDiagnosticsProvider.refreshDocDiagnostics(vscode.window.activeTextEditor.document, codeDiagnostics.Kaudit.AnalysisDiagnosticsProvider.kruleAnalysisDiagnostics);
	// 	viewTree.Kaudit.ExplorerNodeDetailTreeDataProvider.explorerNodeDetailTreeDataProvider.refresh(vscode.window.activeTextEditor.document.uri.fsPath);
	// }
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor) {
				codeDiagnostics.Kaudit.AnalysisDiagnosticsProvider.refreshDocDiagnostics(editor.document, codeDiagnostics.Kaudit.AnalysisDiagnosticsProvider.kruleAnalysisDiagnostics);
				viewTree.Kaudit.ExplorerNodeDetailTreeDataProvider.explorerNodeDetailTreeDataProvider.refresh(editor.document.uri);				
			}
		})
	);
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(e => codeDiagnostics.Kaudit.AnalysisDiagnosticsProvider.refreshDocDiagnostics(e.document, codeDiagnostics.Kaudit.AnalysisDiagnosticsProvider.kruleAnalysisDiagnostics))
	);
	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument(doc => codeDiagnostics.Kaudit.AnalysisDiagnosticsProvider.kruleAnalysisDiagnostics.delete(doc.uri))
	);
}