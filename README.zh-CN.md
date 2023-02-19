# Kaudit

> VSCode插件，辅助源码审计

简体中文 | [English](README.md)

## Still under development...

Something wrong in README, here content will modify when first stable version is available

## 简介

基于正则规则匹配的源码审计工具

* 基于 `Maudit` 审计规则进行扩展
  * 重新定义底层规则模型
  * 支持规则的优先级排序，控制匹配结果的显示排序
* 基于 `Maudit` 设计思想，重构了所有代码，核心处理代码与 `Maudit` 不一致
* 默认正则匹配规则来自 `Maudit` ,但提供自定义规则扩展
* 提供语言以及漏洞类型分类导航
* 提供OUTLINE页内导航

![main](resources/md/main.png)

## 安装

* 从VSCode商店搜索 `maduit`安装
* 源码安装

  ```
  git clone https://github.com/xxxxxx
  cd kaudit
  npm install
  npm install -g vsce
  vsce package
  ```

  从VScode扩展页面菜单选择VSIX文件安装
* 建议安装 `Error Lens`插件，匹配行显示匹配规则的description信息(可选)
* 建议安装 `Output Colorizer`插件，控制台输出将提供颜色区分(可选)

## 快速开始

打开包含 `php/perl/python/java` 源码项目，点击插件界面右上角的刷新按钮，即会对工作空间开始匹配分析

> Tips: 可以拖拽树视图放置到默认的资源管理器中，这样文件浏览和匹配记录浏览在一个界面会比较方便

## 自定义规则

可以在 `Kaudit Configuration`中通过 `CustomRules`自定义规则，如果要扩展的规则不属于 `php/perl/python/java`，那么还需要添加 `SupportLangs`配置

![config](resources/md/config.png)

SupportLangs Format:

```js
"conf.Kaudit.supportLangs": {   
        "java": [
            "java"
        ],
        "perl": [
            "pl",
            "pm"
        ],
        "php": [
            "php",
            "php3",
            "php4",
            "php5",
            "php6",
            "php7",
            "pht",
            "phtml"
        ],
        "python": [
            "py"
        ]
    }
```

CustomRules Format:

```js
"conf.Kaudit.customRules":{
    "php": [
        {
            "group_name": "Command execution",
            "regex": "\\b(system|passthru|pcntl_exec|shell_exec|escapeshellcmd|exec|proc_open|popen|expect_popen)\\s{0,10}\\(.{0,40}\\$\\w{1,20}((\\[[\"']|\\[)\\${0,1}[\\w\\[\\]\"']{0,30}){0,1}",
            "regex_match_cond": {},
            "order": 1000,
            "view_info": {
                "en": {
                    "name": "Command execution",
                    "description": "There are variables in the command execution function, there may be arbitrary command execution vulnerabilities",
                    "detail_url": ""
                },
                "zh": {
                    "name": "命令执行漏洞",
                    "description": "命令执行函数中存在变量，可能存在任意命令执行漏洞",
                    "detail_url": ""
                }
            }
        },
        {
            "group_name": "Code execution",
            "regex": "\\bcall_user_func(_array){0,1}\\(\\s{0,5}\\$\\w{1,15}((\\[[\"']|\\[)\\${0,1}[\\w\\[\\]\"']{0,30}){0,1}",
            "regex_match_cond": {},
            "order": 1000,
            "view_info": {
                "en": {
                    "name": "Code execution",
                    "description": "call_user_func function parameter contains variables, code execution vulnerability may exist",
                    "detail_url": ""
                },
                "zh": {
                    "name": "代码执行漏洞",
                    "description": "call_user_func函数参数包含变量，可能存在代码执行漏洞",
                    "detail_url": ""
                }
            }
        }
    ],
    "perl": [
        {
            "group_name": "Code execution",
            "regex": "\\b(eval)\\s*?\\(.{0,100}(\\$|@)",
            "regex_match_cond": {},
            "order": 1000,
            "view_info": {
                "en": {
                    "name": "Code execution",
                    "description": "function parameter contains variables, code execution vulnerability may exist",
                    "detail_url": ""
                },
                "zh": {
                    "name": "代码执行漏洞",
                    "description": "代码执行函数中存在变量，可能存在代码执行漏洞",
                    "detail_url": ""
                }
            }
        }
    ]
}
```

`group_name` 相同 `group_name`匹配到的数据会被分组在一起

`regex` 按行匹配的正则pattern

`regex_match_cond`  `regex_match_cond`规则，允许对 `regex` 匹配的结果进一步条件过滤

* 目前 `regex_match_cond` 仅支持 `file_contain_regex`。在进行 `regex` 匹配时，还会检查匹配点所在文件是否包含其它 `file_contain_regex` 指定的信息。如果包含则命中，不包含则跳过。
* "regex_match_cond":{"file_contain_regex":{"keyNameNotImportant1":"cond_regex1","keyNameNotImportant2":"cond_regex2"}} 所有file_contain_regex 规则要求在同一个文件内都匹配

`order` 先按照 `order` 排序，如果相同则按照 `group_name`排序，接着 `file name`排序

`view_info` 用于展示提示信息

注意: 所有规则字段都要求存在

## 感谢

参考了以下项目的代码结构和规则

* [maudit](https://github.com/m4yfly/vscode-maudit)

## License

AGPL-3.0

**Enjoy!**
