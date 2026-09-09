import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.describe('Phase 8C learning experience quality gate', () => {
  test('question bank defines three progressive hints and explanations for every refreshed question', async () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'scripts/phase8c-question-bank.sql'), 'utf8');
    const questions = (sql.match(/'question_type'/g) ?? []).length;
    const hintSets = (sql.match(/'hints',jsonb_build_array\(/g) ?? []).length;
    const explanations = (sql.match(/'explanation'/g) ?? []).length;

    expect(questions).toBe(17);
    expect(hintSets).toBe(17);
    expect(explanations).toBeGreaterThanOrEqual(17);
    expect(sql).toContain("'post goods receipt'");
    expect(sql).toContain("'post gr'");
  });

  test('learning UI supports three hints, answer reveal, and non-blocking completion', async () => {
    const exercise = fs.readFileSync(path.join(process.cwd(), 'app/courses/[slug]/ExerciseCard.tsx'), 'utf8');
    const verify = fs.readFileSync(path.join(process.cwd(), 'app/api/verify/route.ts'), 'utf8');
    const exerciseUi = fs.readFileSync(path.join(process.cwd(), 'app/api/exercise-ui/route.ts'), 'utf8');

    expect(exercise).toContain('Hint 1 of 3');
    expect(exercise).toContain('Show answer & explanation');
    expect(exercise).toContain('Learning should not stop here.');
    expect(verify).toContain('learningComplete: passed || revealAnswer');
    expect(verify).toContain('answer_revealed: revealAnswer');
    expect(verify).toContain('exercise.expected_state.accepted');
    expect(exerciseUi).toContain('stableShuffle(row.expected_state.options, row.id)');
  });
});
