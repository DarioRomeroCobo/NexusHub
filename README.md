📘 NexusHub — Ejecución en Local (Windows)
🚀 Requisitos previos
Antes de ejecutar el proyecto en local, asegúrate de tener instalado:

Node.js (versión LTS recomendada)  
https://nodejs.org

Git (opcional, para clonar el repositorio)

Comprueba que Node está instalado, abre una terminal y escribe:

node -v

Si el comando muestran un número, todo está correcto.

📦 Instalación del proyecto
1. Clonar el repositorio
   
En Windows, abre PowerShell y ejecuta:
git clone https://github.com/DarioRomeroCobo/NexusHub.git

Entra en la carpeta del proyecto (esto es MUY importante):
cd NexusHub

⚠️ Todos los comandos deben ejecutarse dentro de la carpeta del proyecto.

2. Instalar dependencias
Ejecuta:
npm install
Esto descargará todas las librerías necesarias dentro de node_modules.

3. Ejecutar el proyecto en local
npm start

Cuando el servidor esté en marcha, abre en tu navegador escribe:
http://localhost:3000
