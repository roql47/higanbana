import type { Dialogue, DialogueLine } from './dialogue';

export interface InvestigationCaseDef {
  id: string;
  act: number;
  title: string;
  optional?: boolean;
  clues: readonly { title: string; prompt: string; lines: readonly DialogueLine[]; summary: string }[];
  steps: readonly {
    prompt: string; question: string; options: readonly string[]; answer: number;
    responses: readonly (readonly DialogueLine[])[];
  }[];
  missing: readonly DialogueLine[];
  ending: readonly DialogueLine[];
  summary: string;
}

/** 장소 탐색과 추론을 분리한다. 각 상호작용이 끝난 뒤만 저장하며 오답은 발견한 단서를 지우지 않는다. */
export class InvestigationCase {
  private playing = false;
  get busy() { return this.playing; }
  get complete() { return this.evidence.has(`${this.def.id}:complete`); }
  get clueCount() { return this.def.clues.filter((_, i) => this.hasClue(i)).length; }
  get started() { return this.clueCount > 0; }
  get nextClue() { return this.def.clues.findIndex((_, i) => !this.hasClue(i)); }
  get nextStep() { return this.complete ? -1 : this.def.steps.findIndex((_, i) => !this.evidence.has(`${this.def.id}:step-${i}`)); }
  hasClue(index: number) { return this.evidence.has(`${this.def.id}:clue-${index}`); }

  constructor(
    readonly def: InvestigationCaseDef,
    private evidence: ReadonlySet<string>,
    private dialogue: Pick<Dialogue, 'say' | 'choose'>,
    private remember: (id: string) => unknown,
    private begin: () => void = () => {},
  ) {}

  async read(index: number): Promise<boolean> {
    const clue = this.def.clues[index];
    if (!clue || this.busy || this.complete || this.hasClue(index)) return false;
    this.playing = true;
    try {
      this.begin();
      await this.dialogue.say(...clue.lines);
      this.remember(`${this.def.id}:clue-${index}`);
      return true;
    } finally { this.playing = false; }
  }

  async resolve(index: number): Promise<boolean> {
    const step = this.def.steps[index];
    if (!step || this.busy || this.complete || index !== this.nextStep) return false;
    this.playing = true;
    try {
      this.begin();
      if (this.nextClue !== -1) { await this.dialogue.say(...this.def.missing); return false; }
      // 새 조사 입력의 preemptNext를 say가 소비한 다음, 주변 대사가 없는 상태에서 선택을 연다.
      await this.dialogue.say({ text: step.prompt });
      const choice = await this.dialogue.choose(step.question, step.options);
      if (!Number.isInteger(choice) || !step.responses[choice]) return false;
      await this.dialogue.say(...step.responses[choice]!);
      if (choice !== step.answer) return false;
      if (index === this.def.steps.length - 1) {
        await this.dialogue.say(...this.def.ending);
        // 마지막 상호작용은 한 번의 저장으로 완료한다. 중간 종료는 마지막 결정부터 재개한다.
        this.remember(`${this.def.id}:complete`);
      } else this.remember(`${this.def.id}:step-${index}`);
      return true;
    } finally { this.playing = false; }
  }
}
