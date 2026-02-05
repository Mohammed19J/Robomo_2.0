FROM python:3.9-slim

WORKDIR /app

# Copy the requirements file specifically first to leverage cache
COPY service/requirements.txt /app/ml/service/requirements.txt

# Install dependencies
RUN pip install --no-cache-dir -r /app/ml/service/requirements.txt

# Copy the entire ml directory
COPY . /app/ml

# Set PYTHONPATH to include /app so 'ml' module is found
ENV PYTHONPATH=/app

EXPOSE 8000

# Run uvicorn pointing to the module structure
CMD ["uvicorn", "ml.service.app:app", "--host", "0.0.0.0", "--port", "8000"]
