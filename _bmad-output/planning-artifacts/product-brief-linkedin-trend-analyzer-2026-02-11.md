---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
date: 2026-02-11
author: Carlo
projectName: linkedin-trend-analyzer
status: complete
---

# Product Brief: LinkedIn Trend Analyzer (ScrapTrends)

## Executive Summary

LinkedIn Trend Analyzer is an internal trend intelligence tool for PlayPlay's content and product teams. It automates the discovery and ranking of emerging social media and corporate communication trends across platforms (LinkedIn, YouTube, TikTok) by scraping content via Apify, storing structured data in a database, and applying engagement-based ranking to surface top-performing formats. Top performers are then analyzed by Gemini AI to identify creative execution patterns (visual style, ICP targeting, communication tone). The tool replaces PlayPlay's current manual monitoring process, enabling earlier trend detection and faster decision-making on which motion design screens and features to develop.

---

## Core Vision

### Problem Statement

PlayPlay's product and creative teams rely entirely on manual monitoring to identify emerging trends in social media and corporate communication. This process is slow, inconsistent, and doesn't scale across multiple platforms and sectors. With no systematic way to detect trends early, the team faces a structural lag between when a format gains traction and when PlayPlay can develop corresponding motion design templates and features for its video creation platform.

### Problem Impact

- Missed early-mover advantage on emerging video formats and communication styles
- Product roadmap decisions based on intuition rather than data
- No cross-platform visibility into what's working across LinkedIn, YouTube, and TikTok
- Development cycles start too late, resulting in templates that launch after trends peak
- No sector-level segmentation to understand corporate vs generic content dynamics

### Why Existing Solutions Fall Short

- No single tool combines multi-platform scraping, engagement ranking, and AI-powered creative analysis in one pipeline
- Generic social listening tools (Brandwatch, Sprout Social) focus on brand mentions and sentiment, not creative execution analysis
- Manual monitoring cannot systematically classify format families (long video, short video, static, text) and format variations (UGC, stop motion, reaction, unboxing) at scale
- No existing tool uses video AI analysis to deconstruct top-performing content into actionable creative insights

### Proposed Solution

A web-based internal tool where users configure scraping parameters (platform, corporate/generic, sector), triggering Apify-based content collection into a structured database. An engagement scoring engine ranks posts using the formula: `(Reactions + Comments + Shares + Clicks) / Impressions x 100`. Results are presented in a ranked dashboard with the Top 10 trends grouped by format type, with all source URLs preserved. Top-performing posts are then sent to Gemini API for deep creative execution analysis using PlayPlay's proprietary prompt.

### Key Differentiators

- **Purpose-built for creative product decisions** - not marketing analytics, but product roadmap intelligence
- **Multi-platform, sector-segmented** - LinkedIn, YouTube, TikTok with corporate/generic filtering by industry
- **Two-stage intelligence pipeline** - quantitative ranking first, then qualitative AI analysis only on top performers (cost-efficient)
- **PlayPlay's proprietary taxonomy** - format families and variations mapped to PlayPlay's own motion design categories
- **Internal-first, client-facing potential** - MVP validates the methodology before scaling to customers

## Target Users

### Primary User

PlayPlay internal team (content strategy, product, creative leads). Single user type for MVP - configures scrapes, reviews rankings, triggers Gemini analysis on top posts.

## MVP Success Metrics

- Effective scraping across LinkedIn, YouTube, TikTok via Apify
- Structured database with complete post metadata
- Clear engagement-based ranking producing actionable Top 10 trends by sector
- Gemini creative analysis working on top performers
- Basic but functional web interface

## MVP Scope

### In Scope
- Multi-platform scraping via Apify API (LinkedIn, YouTube, TikTok)
- Corporate/generic content filtering with sector selection
- Database storage with full post metadata (name, comments, reactions, clicks, impressions, URL, platform, sector, format family, format variation, publication date)
- Engagement scoring: (Reactions + Comments + Shares + Clicks) / Impressions x 100
- Top 10 trend ranking grouped by format type with all source URLs
- Gemini API integration for creative execution analysis on top performers
- Basic web interface for input configuration and results display

### Out of Scope (MVP)
- Client-facing features
- Automated scheduling/recurring scrapes
- User authentication/multi-tenancy
- Historical trend tracking over time
- Export/reporting features
