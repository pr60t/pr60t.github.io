---
date: 25-11-26
title: Welcome to the Lattice
description: Field notes on auditing multi-tenant RAG systems, deterministic canary testing, and the engineering log behind pr60t.
tags: [sample]
draft: false
---

This log documents engineering notes on multi-tenant retrieval-augmented generation (RAG) security, authorization boundary testing, and privacy tooling.

> [!NOTE]
> This is a sample post shipped with the initial repository scaffold. Delete `content/blog/25-11-26-welcome_to_the_lattice.md` when you publish your own writing.

## Why deterministic checks matter

When auditing a multi-tenant RAG platform, relying on another LLM to judge whether data leaked introduces non-determinism and unnecessary compute overhead. A checksum-verified canary document gives a binary, reproducible signal across all three exposure channels:

| Channel | What is inspected | Judge |
| --- | --- | --- |
| Answer | Generated model output | Checksum match |
| Citations | Returned source metadata | Checksum match |
| Raw API | Underlying JSON payload | Checksum match |

## Local workflow

New entries can be scaffolded directly from the CLI and validated before pushing to `main`:

```bash
npm run new -- "Auditing vector metadata filters"
npm run validate:content
```
