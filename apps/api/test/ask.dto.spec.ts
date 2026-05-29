import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AskDto } from '../src/modules/chat/chat.dto';

async function validateDto(data: object) {
  const instance = plainToInstance(AskDto, data);
  return validate(instance);
}

describe('AskDto 검증', () => {
  it('정상 질문은 유효하다', async () => {
    const errors = await validateDto({ question: '계약 기간이 얼마나 되나요?' });
    expect(errors).toHaveLength(0);
  });

  it('빈 문자열은 거부된다', async () => {
    const errors = await validateDto({ question: '' });
    expect(errors.some((e) => e.property === 'question')).toBe(true);
  });

  it('2000자 초과 질문은 거부된다', async () => {
    const errors = await validateDto({ question: 'a'.repeat(2001) });
    const q = errors.find((e) => e.property === 'question');
    expect(q).toBeDefined();
    expect(Object.keys(q!.constraints ?? {})).toContain('maxLength');
  });

  it('정확히 2000자 질문은 유효하다', async () => {
    const errors = await validateDto({ question: 'a'.repeat(2000) });
    expect(errors).toHaveLength(0);
  });

  it('question 필드가 없으면 거부된다', async () => {
    const errors = await validateDto({});
    expect(errors.some((e) => e.property === 'question')).toBe(true);
  });

  it('question이 문자열이 아니면 거부된다', async () => {
    const errors = await validateDto({ question: 12345 });
    expect(errors.some((e) => e.property === 'question')).toBe(true);
  });
});
