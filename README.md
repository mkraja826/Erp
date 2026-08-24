# ERP Edu

ERP Edu is a practical SAP learning platform built around one core outcome: learners should be able to perform real SAP work, not only finish lessons.

## Product loop

Learn → Practice → Verify → Prove skill → Work simulation

## Product principles

- Beginner-friendly explanations for average learners.
- Short, active lessons designed to avoid boredom.
- AI assistance that prevents learners from getting stuck.
- Progressive hints instead of immediately giving away answers.
- Safe practice environments with reset/retry support.
- Automatic verification based on task state and business rules.
- Competency scoring based on real performance.
- Post-course simulated workplace with tickets and business scenarios.
- Verifiable platform certificates based on demonstrated skills.

## First vertical slice

The first complete track will be SAP MM:

1. Beginner concepts
2. Guided procurement exercises
3. Independent practice
4. Verification engine integration
5. End-to-end project
6. Simulated junior SAP MM workplace
7. Verified competency certificate

## Architecture direction

The application will evolve into separate learning, AI coach, practice, verification, skill, work-lab, and certification domains behind a common API and identity layer.

## Current state

The repository currently contains the first responsive learner experience and CI foundation. Backend persistence, authentication, AI provider integration, the real practice engine, and verifier services are subsequent milestones.

## Development

```bash
npm install
npm run dev
```

Validate with:

```bash
npm run typecheck
npm run build
```
