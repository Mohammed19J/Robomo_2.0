FROM python:3.10-slim
WORKDIR /app
COPY ml/service/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY ml /app/ml
EXPOSE 8000
CMD ["uvicorn", "ml.service.app:app", "--host", "0.0.0.0", "--port", "8000"]
