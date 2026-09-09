# Phase 8C — Learning Experience Redesign

Status: implementation candidate; keep launch readiness NO-GO until CI is green, the question-bank refresh is applied, and live mobile acceptance is complete.

## Learner experience

Lessons use a four-stage flow: Learn → See → Do → Check. Repetitive teaching cards are removed from the lesson template. The learner gets one concise concept explanation, a business scenario, a practical decision/action, and a knowledge check.

## Question behavior

Learning questions support exactly three progressive hints. A wrong answer never permanently blocks lesson progress. After all three hints, the learner can reveal the correct answer and explanation; that completes the lesson for learning purposes while recording that the answer was revealed. Certification and workplace assessment remain separate and should not reveal answers during assessment.

Multiple-choice options are deterministically shuffled per exercise so source-bank answer position cannot become a visible pattern. Short answers use normalized configured accepted variants; the Goods Receipt lesson accepts GR, Goods Receipt, Post GR, and Post Goods Receipt.

## Evidence

Exercise attempts record assistance level through `ai_help_count` and feedback metadata. A revealed answer is stored as `answer_revealed: true`, allowing later competency logic to distinguish independent success from guided learning completion.

## Content gate

`scripts/phase8c-question-bank.sql` replaces all 17 SAP Foundations and SAP MM Level 1 learning questions with scenario/application prompts, realistic distractors, three hints, and explanations. Apply it only after the Phase 8C application code is deployed.
