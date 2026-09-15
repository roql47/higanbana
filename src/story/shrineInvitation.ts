/** Reading the last line, not approaching the shrine, accepts the false invitation. */
export const SHRINE_INVITATION = [
 '받침대 여섯에는 물건의 홈이 있다. 일곱 번째만 비어 있고, 다른 자리보다 넓다.',
 '「피안의 문을 열고자 하는 자여.」',
 '「일곱 공물을 모아 이곳에 바쳐라.」',
 '「그러면 돌아갈 길이 열리리라.」',
 '미오: 일곱 개를 모으면…… 여기서 나갈 수 있어.',
 '미오: 언니도 저 안에 있다면.',
 '미오: 이번에는 얼굴을 보고 물어볼 거야. 왜 나를 기다린다고 했는지.',
] as const;
export class ShrineInvitation {
 index=-1;
 accepted=false;
 advance(evidenceReady:boolean){
  if(!evidenceReady)return '먼저 마을에서 사람이 사라지기 직전의 흔적 세 곳을 확인하자.';
  if(this.accepted)return '「일곱 공물을 모아 이곳에 바쳐라. 그러면 돌아갈 길이 열리리라.」';
  if(this.index<SHRINE_INVITATION.length-1)return SHRINE_INVITATION[++this.index]!;
  this.accepted=true;return '목표 · 일곱 공물을 찾아라 0/7\n첫 번째 장소: 작은 사당. 아직 본전 문은 열리지 않는다.';
 }
}
