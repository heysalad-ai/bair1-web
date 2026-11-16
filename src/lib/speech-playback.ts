import {
  sampleFace,
  validateFaceAnimation,
  type FaceAnimation,
  type FacePose,
} from "./face-animation";
export type SpeechState = {
  loading: boolean;
  speaking: boolean;
  error: string;
  face?: FacePose;
  faceStatus?: string;
  ready?: boolean;
};
/** Abort and generation guards keep cancelled or superseded audio silent. */
export class SpeechPlayback {
  private version = 0;
  private preparedText = "";
  private resumePlayback: (() => Promise<void>) | null = null;
  private animationFrame: number | null = null;
  private pending: AbortController | null = null;
  private audio: HTMLAudioElement | null = null;
  constructor(
    private request: typeof fetch,
    private onState: (state: SpeechState) => void,
    private makeAudio = (url: string) => new Audio(url),
    private animate = true,
  ) {}
  stop() {
    this.version++;
    this.preparedText = "";
    this.resumePlayback = null;
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.pending?.abort();
    this.pending = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = null;
    }
    this.onState({ loading: false, speaking: false, error: "" });
  }
  async speak(text: string) {
    if (this.resumePlayback && this.preparedText === text) {
      await this.resumePlayback();
      return;
    }
    this.stop();
    const version = this.version;
    const controller = new AbortController();
    this.pending = controller;
    this.onState({ loading: true, speaking: false, error: "" });
    try {
      const response = await this.request("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, animate: this.animate }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (version !== this.version) return;
      if (!response.ok)
        throw new Error(
          result.error || "Voice is unavailable. Please try again.",
        );
      if (
        typeof result.audio !== "string" ||
        !result.audio.startsWith("data:audio/wav;base64,")
      )
        throw new Error("Voice could not be loaded. Please try again.");
      let animation: FaceAnimation | null = null;
      let faceStatus = this.animate ? result.faceStatus : "disabled";
      if (this.animate && result.animation) {
        try {
          animation = validateFaceAnimation(
            result.animation,
            result.animation.duration,
          );
        } catch {
          faceStatus = "unavailable";
        }
      }
      if (faceStatus === "ready" && !animation) faceStatus = "unavailable";
      const audio = this.makeAudio(result.audio);
      this.audio = audio;
      const finish = () => {
        if (version === this.version) this.stop();
      };
      audio.onended = finish;
      audio.onerror = () => {
        if (version === this.version) {
          this.stop();
          this.onState({
            loading: false,
            speaking: false,
            error: "Audio could not be played. Try Read summary again.",
          });
        }
      };
      const tick = () => {
        if (version !== this.version) return;
        this.onState({
          loading: false,
          speaking: true,
          error: "",
          face: animation
            ? sampleFace(animation, audio.currentTime)
            : undefined,
          faceStatus: animation ? "ready" : faceStatus,
        });
        if (animation) this.animationFrame = requestAnimationFrame(tick);
      };
      let resuming = false;
      const resume = async () => {
        if (resuming || version !== this.version) return;
        resuming = true;
        try {
          await audio.play();
          if (version !== this.version) {
            audio.pause();
            return;
          }
          this.preparedText = "";
          this.resumePlayback = null;
          tick();
        } catch (cause) {
          if (version !== this.version) return;
          if (
            cause &&
            typeof cause === "object" &&
            "name" in cause &&
            cause.name === "NotAllowedError"
          ) {
            // Keep this exact element/clip so the next click can play it
            // directly, without another network wait or usage reservation.
            this.preparedText = text;
            this.resumePlayback = resume;
            this.onState({
              loading: false,
              speaking: false,
              ready: true,
              error: "",
            });
          } else {
            this.stop();
            this.onState({
              loading: false,
              speaking: false,
              error:
                cause instanceof Error
                  ? cause.message
                  : "Audio could not be played. Please try again.",
            });
          }
        } finally {
          resuming = false;
        }
      };
      await resume();
    } catch (cause) {
      if (version !== this.version) return;
      this.stop();
      this.onState({
        loading: false,
        speaking: false,
        error:
          cause instanceof Error
            ? cause.message
            : "Voice is unavailable. Please try again.",
      });
    }
  }
}
