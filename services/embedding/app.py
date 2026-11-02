from contextlib import asynccontextmanager
from fastapi import FastAPI
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer
import os
@asynccontextmanager
async def lifespan(app):
    # Load once; normalized vectors use cosine similarity in Qdrant.
    app.state.model = SentenceTransformer(os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"))
    yield
app = FastAPI(lifespan=lifespan)
class EmbeddingRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=32)
@app.get("/health")
def health():
    return {"ready": True, "dimensions": 384}
@app.post("/embed")
def embed(request: EmbeddingRequest):
    vectors = app.state.model.encode([text[:4000] for text in request.texts], normalize_embeddings=True).tolist()
    return {"vectors": vectors, "model": "all-MiniLM-L6-v2"}
