import { createInterface } from 'node:readline';

export function askQuestion(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`\n${question} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function confirm(
  question: string,
  defaultValue: 'yes' | 'no' = 'no'
): Promise<boolean> {
  const hint = defaultValue === 'yes' ? '(Y/n)' : '(y/N)';
  const tty = Boolean(process.stdin.isTTY);

  if (!tty) return defaultValue === 'yes';

  const answer = (await askQuestion(`${question} ${hint}`)).toLowerCase();
  if (answer === 'y' || answer === 'yes') return true;
  if (answer === 'n' || answer === 'no') return false;
  return defaultValue === 'yes';
}

export async function promptPassword(
  label: string
): Promise<string | null> {
  const tty = Boolean(process.stdin.isTTY);
  if (!tty) return null;

  const answer = await askQuestion(`${label} (input hidden only in some terminals):`);
  return answer.length > 0 ? answer : null;
}