# Learner API Key UX (A + C)

**Status:** Implemented 2026-09-20

## Behavior
- **A:** When active skill copy matches env/API/model-setup heuristics, show `ApiKeyConfigPanel` under「本章技能」.
- **C:** 「云端运行」 without `DEEPSEEK_API_KEY` opens the same panel as a modal;「保存并云端试跑」continues.
- Keys stored in `localStorage` (`codepilot.env.{pathId}.{chapterId}`) and synced to `.env（高级）` tab.
- Platform `LLM_API_KEY` is not injected into Modal.
