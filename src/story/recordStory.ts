/** Opt-in local diagnostic capture of the actual WebGL canvas, without audio. */
export function recordStory(canvas: HTMLCanvasElement) {
  const status = document.createElement('div');
  status.style.cssText = 'position:fixed;bottom:20px;left:20px;color:white;background:#222;padding:8px;z-index:10000';
  status.textContent = '플레이 화면 녹화 중 · 20초'; document.body.append(status);
  const stream = canvas.captureStream(60);
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    try {
      const response = await fetch('/__story-recording', { method: 'POST', body: new Blob(chunks, { type: 'video/webm' }) });
      if (!response.ok) throw new Error('save failed');
      status.textContent = '녹화 저장 완료';
    } catch { status.textContent = '녹화 저장 실패'; }
  };
  recorder.start(1000);
  setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 20_000);
}
