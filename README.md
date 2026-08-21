# mndmap
A markdown powered project management dashboard and visualization engine.

## Dependencies
This project is building off two existing projects:
System modeling visualization tool - https://github.com/kotulc/mndflow
Markdown website publication engine - https://github.com/kotulc/mdsite

The idea is to leverage the reactflow diagram "views" of mndflow for visualization (as well as its overall look and feel) and extend that to this tool. Both tools should "speak" the same language (though mndflow is still actively moving) and leverage this project as one of many extensions that the final mndflow tool can leverage.

mdsite can be used for publishing the documentation and can be leveraged as a github workflow ci/cd step. Ideally the published documentation from this tool will contain diagram SVG exports that reflect the current state of the working project.

## Problem Statement
Managing multi-agent workflows or teams working collaboratively on a living project is tedious and fragile. Project documents used for planning and tracking implementation become bloated and unmaintainable. Documents acting as "truth" often get overwritten or missed entirely. 

## Proposed Solution
This tool does not define agentic workflows or re-invent git, instead it leverages existing tools and project documents and translates these documents into managable parallel write-safe queriable data objects presented in a simple general and unified dashboard, whose interface surface is defined by API, whose content is maintained in a standard database format and then whose state is presented in published documentation as living embedded dynamic diagram artifacts.

## Goals
- Generalize to requirement/specification/project tasking tracking and management cases
- Automate document to query-able data source and interface surface translation
- Visualize the data and interface surfaces via a simple and elegent modern dashboard (use the mndflow themes)
- Provide/embed dynamic react components in published docs that reflect the structure and state of those docs 
- Published static docs use the mdsite theme, present doc/project state in a flow diagram svg
- Translation process is generic and repeatable for any collection of source .md or .mdx documents
- Translator works in both directions: parses source documents, writes document revisions in a safe manner
- Agent-first interface surface for agent tool to query/update owned project items in a parellel work environment
- Stretch goal: Translator may be leveraged by mndflow to generate block structure projects directly from docs
