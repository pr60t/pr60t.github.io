export interface ExternalLink {
  readonly label: string;
  readonly href: string;
  readonly kind: 'email' | 'github' | 'linkedin' | 'web';
}

export interface ProjectEntry {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly year?: string;
  readonly repoUrl: string;
  readonly shortSummary: string;
  readonly summary: string;
  readonly stack: readonly string[];
  readonly highlights?: readonly string[];
  readonly pendingNote?: string;
}

export interface ExperienceEntry {
  readonly org: string;
  readonly role: string;
  readonly period: string;
  readonly summary: string;
  readonly url?: string;
  readonly repoUrl?: string;
  readonly stack?: readonly string[];
}

export interface EducationEntry {
  readonly degree: string;
  readonly institution: string;
  readonly period: string;
  readonly note: string;
  readonly coursework: readonly string[];
}

export interface SkillGroup {
  readonly label: string;
  readonly items: readonly string[];
}

export interface RagBeatCopy {
  readonly id: string;
  readonly marker: string;
  readonly title: string;
  readonly summary: string;
  readonly telemetry: string;
}

export interface ProfileData {
  readonly name: string;
  readonly handle: string;
  readonly role: string;
  readonly heroHeadlineTop: string;
  readonly heroHeadlineAccent: string;
  readonly heroSub: string;
  readonly location: string;
  readonly availability: string;
  readonly contacts: readonly ExternalLink[];
  readonly verifiableStats: readonly string[];
  readonly ragBeats: readonly RagBeatCopy[];
  readonly firedamp: ProjectEntry;
  readonly firedampSteps: readonly RagBeatCopy[];
  readonly chrona: ProjectEntry;
  readonly experience: readonly ExperienceEntry[];
  readonly education: readonly EducationEntry[];
  readonly skills: readonly SkillGroup[];
}

export const PROFILE: ProfileData = {
  name: 'Arun Bobby',
  handle: 'pr60t',
  role: 'Secure AI Engineer',
  heroHeadlineTop: 'Secure',
  heroHeadlineAccent: 'AI engineer.',
  heroSub:
    'I plant canaries in multi-tenant RAG systems and watch for the one that sings in the wrong room.',
  location: 'Kerala, India',
  availability: 'Open to junior AI security / secure AI engineering roles; remote or relocation.',
  contacts: [
    {
      label: 'Email',
      href: 'mailto:arunbobby226@gmail.com',
      kind: 'email',
    },
    {
      label: 'GitHub',
      href: 'https://github.com/pr60t',
      kind: 'github',
    },
    {
      label: 'LinkedIn',
      href: 'https://www.linkedin.com/in/arun-bobby/',
      kind: 'linkedin',
    },
  ],
  verifiableStats: [
    '4 yrs open-source privacy tooling',
    '18 active clients',
    'CGPA 8.6',
  ],
  ragBeats: [
    {
      id: 'ingest',
      marker: 'BEAT 01 / INGEST',
      title: 'Documents enter a shared store',
      summary:
        'Tenant documents are parsed into discrete text chunks. Without strict tenant tagging at ingestion, boundaries blur before retrieval even begins.',
      telemetry: 'stage: ingest | tenant: A | boundary: pre-chunk',
    },
    {
      id: 'embed',
      marker: 'BEAT 02 / EMBED',
      title: 'Chunks map into vector space',
      summary:
        'Each chunk is projected into a shared embedding manifold where semantic proximity can outrank authorization if metadata filters are misconfigured.',
      telemetry: 'stage: embed | dim: 1536 -> 3 | clusters: semantic',
    },
    {
      id: 'retrieve',
      marker: 'BEAT 03 / RETRIEVE',
      title: 'Top-k nearest neighbors surface',
      summary:
        'A query vector sweeps the index and pulls the k closest chunks into the prompt context. Any cross-tenant leak here enters the model window.',
      telemetry: 'stage: retrieve | k: 5 | metric: cosine',
    },
  ],
  firedamp: {
    id: 'firedamp',
    eyebrow: '// CASE FILE 01',
    title: 'Firedamp',
    year: '2026',
    repoUrl: 'https://github.com/pr60t/firedamp',
    shortSummary:
      'Open-source CLI that audits multi-tenant RAG platforms for cross-user data leakage using deterministic canary documents.',
    summary:
      'Open-source CLI that audits multi-tenant RAG platforms (Open WebUI adapter) for cross-user data leakage. Plants checksum-verified canary documents as one user, probes as another, and flags any exposure in answers, citations or raw API responses. Deterministic matching, no LLM judge, no GPU.',
    stack: ['Python', 'Docker', 'REST APIs', 'GitHub Actions', 'pytest'],
    highlights: [
      // TODO(owner): add exact count of published Open WebUI authorization advisories in the regression suite once finalized.
      'Regression suite of published Open WebUI authorization advisories.',
      // TODO(owner): add exact count of authorization matrix test cases once measured.
      'API-replay authorization matrix covering owner, intruder, ex-member, and anonymous roles.',
      'Revocation, write-side poisoning, and agent-memory scenarios.',
      'YAML policy gate, SARIF export for GitHub code scanning, and a reusable GitHub Action for pull-request checks.',
    ],
  },
  firedampSteps: [
    {
      id: 'plant',
      marker: '01 / PLANT',
      title: 'Seed checksum-verified canary',
      summary:
        'Insert a deterministic canary document into Tenant A as User A with a verifiable checksum.',
      telemetry: 'action: plant | owner: tenant-a | judge: deterministic',
    },
    {
      id: 'probe',
      marker: '02 / PROBE',
      title: 'Replay across authorization roles',
      summary:
        'Probe the retrieval boundary as intruder, ex-member, or anonymous caller to test ACL enforcement.',
      telemetry: 'action: probe | caller: tenant-b | matrix: 4 roles',
    },
    {
      id: 'detect',
      marker: '03 / DETECT',
      title: 'Inspect all three exposure channels',
      summary:
        'Flag any canary match across generated answers, citations, or raw API responses.',
      telemetry: 'channels: answer, citations, raw-api | match: checksum',
    },
    {
      id: 'report',
      marker: '04 / REPORT',
      title: 'Gate CI with SARIF & policy',
      summary:
        'Emit SARIF findings for GitHub code scanning and enforce pass/fail thresholds via YAML policy.',
      telemetry: 'output: sarif | gate: yaml-policy | ci: github-action',
    },
  ],
  chrona: {
    id: 'chrona',
    eyebrow: '// PROJECT 02 · ANDROID',
    title: 'Chrona',
    subtitle: 'A Clock Without Timezone Boundaries.',
    repoUrl: 'https://github.com/pr60t/chrona',
    shortSummary:
      'Android clock app for setting cross-timezone alarms that ring at the exact right local time with automatic DST.',
    summary:
      'An Android clock application built around one key idea: setting an alarm for a specific time in another timezone and having it ring at exactly the right local time, wherever you are. Combines cross-timezone alarms with automatic daylight-saving adjustments, world clocks, timers, a stopwatch, and bedtime scheduling.',
    stack: [
      'Kotlin',
      'Jetpack Compose',
      'Material Design',
      'IANA Timezones',
      'GeoNames',
      'Natural Earth',
    ],
    highlights: [
      'Conceived product vision, designed the UI, and led development using Kotlin and Jetpack Compose.',
      'Inspired by Google Pixel Clock and Material Design, with custom-designed widgets and adaptive light and dark themes.',
      'World clock catalogue backed by GeoNames city coordinates, IANA timezone rules for DST transitions, and Natural Earth map data.',
    ],
  },
  experience: [
    {
      org: 'SpaceLegion',
      role: 'Founder — Open-source privacy tooling',
      period: '2020-2024',
      url: 'https://spacelegion.org',
      repoUrl: 'https://github.com/space-legion',
      summary:
        'Founded an open-source privacy tooling organization focused mainly on Linux hardening tools. Designed the organization website, blog pages, and an application delivering daily blog posts.',
      stack: ['Kotlin', 'Python', 'JavaScript', 'C++'],
    },
    {
      org: 'Freelance Software Developer and Privacy Consultant',
      role: 'Independent',
      period: '2023-2026',
      summary:
        '18 active clients. Open-source privacy tooling setup and consulting; custom hardened Linux-based OS and Linux automation scripts; custom VPN frameworks and Android apps; stock-investment automation framework deployed on a server.',
    },
  ],
  education: [
    {
      degree: 'B.C.A.',
      institution: 'Mangalore University',
      period: '2021-2024',
      note: 'CGPA 8.6/10',
      coursework: ['Data Structures', 'Software Engineering', 'DBMS', 'Computer Networks'],
    },
    {
      degree: 'M.Computer Science (not completed)',
      institution: 'University of Adelaide',
      period: '2025-2026',
      note: 'Graduate coursework',
      coursework: [
        'NLP',
        'Event-Driven Computing',
        'Distributed Systems',
        'Secure Programming',
        'AI',
        'Big Data Analysis',
      ],
    },
  ],
  skills: [
    {
      label: 'Languages',
      items: ['Python', 'Kotlin', 'JavaScript', 'C++', 'Java', 'Bash', 'SQL'],
    },
    {
      label: 'Systems & Tooling',
      items: [
        'Docker',
        'Git',
        'GitHub Actions',
        'REST APIs',
        'pytest',
        'Node.js',
        'Android',
        'Linux administration',
        'server hosting',
      ],
    },
    {
      label: 'Security & AI',
      items: [
        'Linux hardening',
        'custom VPN frameworks',
        'privacy tooling',
        'RAG systems',
        'multi-tenant authorization testing',
        'CVE research',
        'SARIF',
        'OWASP Top 10 for LLM Applications (working knowledge)',
      ],
    },
  ],
};

export const ARTIFACTS: readonly ProjectEntry[] = [PROFILE.firedamp, PROFILE.chrona];
