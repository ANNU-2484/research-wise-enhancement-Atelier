# Atelier

## An Agentic AI Framework for Intelligent Research Automation, Scientific Knowledge Discovery and Autonomous Research Assistance

Atelier is an AI-powered research assistance framework designed to support researchers throughout the research workflow. It provides a unified environment for managing research papers, retrieving relevant information, performing literature analysis, identifying research gaps, comparing research papers, recommending methodologies, generating citations, verifying evidence, analysing potential research novelty, planning research activities, and generating structured research reports.

The system combines Retrieval-Augmented Generation (RAG), Knowledge Base/Vector Database retrieval, and a multi-agent AI architecture to divide complex research activities into specialized tasks.

Instead of requiring researchers to switch between multiple tools for different research activities, Atelier brings major research-support tasks into a single integrated platform.

---

# Table of Contents

- [Overview](#overview)
- [Problem Statement](#problem-statement)
- [Motivation](#motivation)
- [Objectives](#objectives)
- [Proposed Solution](#proposed-solution)
- [Key Features](#key-features)
- [System Workflow](#system-workflow)
- [System Architecture](#system-architecture)
- [Modules](#modules)
  - [Module 1: Research Paper Management & Retrieval](#module-1-research-paper-management--retrieval)
  - [Module 2: Multi-Agent Research Analysis](#module-2-multi-agent-research-analysis)
  - [Module 3: Research Planning & Report Generation](#module-3-research-planning--report-generation)
- [AI Agents](#ai-agents)
- [RAG Pipeline](#rag-pipeline)
- [Knowledge Retrieval](#knowledge-retrieval)
- [Citation Generation](#citation-generation)
- [Evidence Verification](#evidence-verification)
- [Research Gap Identification](#research-gap-identification)
- [Novelty Analysis](#novelty-analysis)
- [Technology Stack](#technology-stack)
- [Functional Requirements](#functional-requirements)
- [Non-Functional Requirements](#non-functional-requirements)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [Running the Project](#running-the-project)
- [Research Workflow](#research-workflow)
- [Output](#output)
- [Advantages](#advantages)
- [Limitations](#limitations)
- [Future Scope](#future-scope)
- [Research Publication](#research-publication)
- [License](#license)

---

# Overview

Academic research involves several interconnected activities such as:

- Searching and collecting research papers
- Managing research documents
- Reviewing existing literature
- Retrieving relevant information
- Comparing research papers
- Identifying research gaps
- Selecting suitable methodologies
- Managing citations
- Verifying research evidence
- Assessing potential research novelty
- Planning research activities
- Preparing research reports

Existing research platforms and AI tools often focus on specific research activities. As a result, researchers may need to use multiple applications during the research process.

Atelier addresses this problem by providing an integrated research environment where multiple AI agents collaborate to support different stages of the research workflow.

---

# Problem Statement

Researchers often need to switch between different tools for literature search, document management, summarization, citation generation, research gap identification, methodology selection, and report preparation.

This fragmented workflow can result in:

- Repeated manual work
- Difficulty managing research documents
- Time-consuming literature analysis
- Difficulty correlating information from multiple papers
- Inconsistent research outputs
- Difficulty maintaining evidence and source traceability
- Increased effort in preparing structured research reports

Therefore, there is a need for an integrated research assistance framework capable of supporting multiple research activities through a coordinated AI-assisted workflow.

---

# Motivation

The motivation behind Atelier is to reduce the fragmentation present in the academic research workflow.

The system aims to provide researchers with a single workspace where they can:

1. Upload and manage research papers.
2. Retrieve relevant information from research documents.
3. Analyse literature using specialized AI agents.
4. Identify research gaps.
5. Compare research papers.
6. Recommend possible research methodologies.
7. Generate citations.
8. Verify generated claims against retrieved evidence.
9. Analyse potential research novelty.
10. Plan future research activities.
11. Generate a structured research report.

---

# Objectives

The main objectives of Atelier are:

- To provide a unified research workspace.
- To manage research papers and PDF documents.
- To retrieve relevant research information using RAG.
- To organize research information in a Knowledge Base.
- To use specialized AI agents for different research tasks.
- To automate literature review and paper analysis.
- To identify research gaps from existing literature.
- To compare research papers systematically.
- To recommend suitable research methodologies.
- To generate citations in multiple formats.
- To support evidence-based research analysis.
- To analyse potential research novelty.
- To generate research roadmaps.
- To provide AI-assisted research interaction.
- To generate structured research reports.

---

# Proposed Solution

Atelier uses a multi-agent architecture where different research activities are handled by specialized agents.

Research documents are first uploaded and processed. Relevant information is stored and made available through retrieval mechanisms.

The retrieved information is then provided to specialized research agents. Each agent performs a particular research task and produces structured results.

The outputs from multiple agents are then integrated to generate a research plan and final research report.

The overall workflow can be represented as:

```text
Research Papers
      |
      v
Document Processing
      |
      v
Knowledge Base / Vector Retrieval
      |
      v
Relevant Information Retrieval
      |
      v
Multi-Agent Research Analysis
      |
      +-----------------------------+
      |                             |
      v                             v
Literature Review            Paper Comparison
      |
      +-----------------------------+
      |
      v
Research Gap Identification
      |
      v
Methodology Recommendation
      |
      v
Citation Generation
      |
      v
Evidence Verification
      |
      v
Novelty Analysis
      |
      v
Research Planning
      |
      v
Roadmap Generation
      |
      v
Structured Research Report

## 🎥 Project Demo

The following video demonstrates the working of **Atelier – An Agentic AI Framework for Intelligent Research Automation, Scientific Knowledge Discovery and Autonomous Research Assistance**.

### Demo Video

▶️ **[Watch the Atelier Project Demo]**

The demonstration covers:

- User authentication and account management
- Research topic creation
- Research paper upload and management
- Paper relevance checking
- Multi-agent research analysis
- Literature review generation
- Paper comparison
- Research gap identification
- Methodology recommendation
- Citation generation
- Evidence verification
- Research novelty analysis
- Research roadmap generation
- AI-assisted research chat
- Final research report generation
