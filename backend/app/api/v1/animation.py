"""动画生成 API — LLM 生成结构化动画 JSON"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from app.core.deps import get_current_user
from app.models.models import User
from app.services.llm import call_llm_json

router = APIRouter()


class AnimationRequest(BaseModel):
    topic: str = Field(..., min_length=2, max_length=200, examples=["冒泡排序算法"])


ANIMATION_PROMPT = """你是一个编程教学动画生成器。根据用户给出的主题，生成一个结构化的动画描述 JSON。

要求格式严格如下：
{{
  "type": "sorting" | "array" | "tree" | "flowchart" | "concept",
  "title": "动画标题",
  "description": "简短描述",
  "config": {{
    "fps": 30,
    "durationInFrames": 150
  }},
  "steps": [
    {{
      "frame": 0,
      "action": "highlight" | "swap" | "compare" | "insert" | "remove" | "show_text",
      "indices": [0, 1],
      "label": "步骤说明"
    }}
  ],
  "data": {{
    "values": [64, 34, 25, 12, 22, 11, 90],
    "labels": ["可选标签"]
  }}
}}

type 说明：
- "sorting": 排序算法动画（冒泡/选择/插入/快排），data.values 是待排序数组
- "array": 数组操作动画（push/pop/遍历），data.values 是初始数组
- "concept": 概念讲解动画（流程/原理），steps 包含 show_text action

规则：
1. steps 中的 frame 必须递增，间隔至少 15 帧
2. 每步都有 label 中文说明
3. sorting 类型必须包含完整的排序过程
4. durationInFrames = 最后一步的 frame + 30
5. data.values 通常 5-8 个数字

主题：{topic}"""


@router.post("/generate")
async def generate_animation(
    req: AnimationRequest,
    user: User = Depends(get_current_user),
):
    """根据主题生成动画 JSON 数据"""
    prompt = ANIMATION_PROMPT.format(topic=req.topic)
    result = await call_llm_json(prompt, temperature=0.3)
    return result
