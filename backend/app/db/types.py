"""SQLAlchemy + asyncpg 兼容的 pgvector 列类型。

pgvector.sqlalchemy.VECTOR 的 bind_processor 会把 list 转成字符串，
而 asyncpg 的 register_vector 编解码需要 list/ndarray，二者冲突。
此处跳过 stringify，把原始 list 交给 asyncpg codec。
"""

from typing import Any

from sqlalchemy.dialects.postgresql.base import ischema_names
from pgvector.sqlalchemy import VECTOR


class AsyncpgVector(VECTOR):
    cache_ok = True

    def bind_processor(self, dialect: Any) -> Any:
        def process(value: Any) -> Any:
            if value is None:
                return None
            if isinstance(value, list):
                return [float(x) for x in value]
            return value

        return process


# 反射时也使用兼容类型
ischema_names["vector"] = AsyncpgVector  # type: ignore[assignment]
