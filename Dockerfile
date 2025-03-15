# Use the official Ollama base image
FROM ollama/ollama

# Expose Ollama's API port
EXPOSE 11434

# Start Ollama and pull DeepSeek model
CMD ollama serve & sleep 2 && ollama pull deepseek && wait
