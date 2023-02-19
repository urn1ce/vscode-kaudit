import * as vscode from 'vscode';
import * as core from './analysisCore'
import * as config from "./config";

export namespace Kaudit{

    export class AnalysisDiagnosticsProvider implements vscode.CodeActionProvider{

        public static kruleAnalysisDiagnostics = vscode.languages.createDiagnosticCollection("krule_analysis_diagnostics");

        provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
            return [];//now no action, maybe add in future to handle detail_url and so on
        }

        public static refreshDocDiagnostics(doc: vscode.TextDocument, analysisDiagnosticsCollection: vscode.DiagnosticCollection) {
            let diagnostics: vscode.Diagnostic[] = [];
            let analysisRecords = core.Kaudit.Analysis.filePath2AnalysisRecords.get(doc.uri.fsPath);
            if(analysisRecords) {
                // analysisRecords have sorted byLineNum Than Column Then Order Than Regex
                for(let ar of analysisRecords){
                    let range = new vscode.Range(ar.regex.matchLineNumStart, ar.regex.startColumn, ar.regex.matchLineNumEnd, ar.regex.endColumn);
                    let nowRangeText = doc.getText(range);
                    let severity = vscode.DiagnosticSeverity.Information;
                    let premsg = "";
                    if( nowRangeText.trim() !== ar.regex.matchContent.trim()){//some rules match end space,but nowRangeText do not have (test conclusion),so trim then compare
                        severity = vscode.DiagnosticSeverity.Warning;
                        premsg = `Out of Date (line${ar.regex.matchLineNumStart+1}): matchContent-${ar.regex.matchContent.trim()} currentContent-${nowRangeText.trim()}  `
                    }
                    let diagnostic = new vscode.Diagnostic(range, premsg + ar.regex.rule.view_info[config.Kaudit.Config.getLanguage()]["description"],
                    severity);
                    diagnostics.push(diagnostic);
                }
            }
            analysisDiagnosticsCollection.set(doc.uri, diagnostics);            
        }

        public static subscribeToDocumentChanges(context: vscode.ExtensionContext, analysisDiagnosticsCollection: vscode.DiagnosticCollection): void {
            if (vscode.window.activeTextEditor) {
                AnalysisDiagnosticsProvider.refreshDocDiagnostics(vscode.window.activeTextEditor.document, analysisDiagnosticsCollection);
            }
            context.subscriptions.push(
                vscode.window.onDidChangeActiveTextEditor(editor => {
                    if (editor) {
                        AnalysisDiagnosticsProvider.refreshDocDiagnostics(editor.document, analysisDiagnosticsCollection);
                    }
                })
            );
            context.subscriptions.push(
                vscode.workspace.onDidChangeTextDocument(e => AnalysisDiagnosticsProvider.refreshDocDiagnostics(e.document, analysisDiagnosticsCollection))
            );
            context.subscriptions.push(
                vscode.workspace.onDidCloseTextDocument(doc => analysisDiagnosticsCollection.delete(doc.uri))
            );
        }
    }


}