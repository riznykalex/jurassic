import http.server
import socketserver
import socket

# Налаштування порту
PORT = 8000

# Функція для отримання IP-адреси
def get_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Не потрібно підключатися, це просто перевірка інтерфейсу
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

local_ip = get_ip()

print("--------------------------------------------------")
print(f"Сервер запущено! Ви можете підключитися:")
print(f"1. З цього комп'ютера: http://localhost:{PORT}")
print(f"2. З іншого пристрою:  http://{local_ip}:{PORT}")
print("--------------------------------------------------")
print("Натисніть Ctrl+C у цьому вікні, щоб зупинити сервер.")

Handler = http.server.SimpleHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()