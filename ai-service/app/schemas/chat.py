from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core import config


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=config.CHAT_MAX_MESSAGE_CHARS)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messages: list[ChatMessage] = Field(min_length=1, max_length=config.CHAT_MAX_MESSAGES)

    @model_validator(mode="after")
    def last_message_is_from_user(self) -> "ChatRequest":
        if self.messages[-1].role != "user":
            raise ValueError("the last message must be from the user")
        return self
