
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const correo = document.getElementById('correo').value;
    const password = document.getElementById('password').value;
    const mensajeError = document.getElementById('mensajeError');

    try {
        const response = await fetch('/usuario/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ correo, password })
        });

        const data = await response.json();

        if (data.ok) {
            // Si todo va bien, mandamos al usuario al inicio-usuario (dashboard)
             window.location.replace("/inicio-usuario");
        } else {
            // Si hay error, lo mostramos
            mensajeError.textContent = data.error;
            mensajeError.classList.remove('d-none');
        }
    } catch (error) {
        console.error('Error:', error);
        mensajeError.textContent = "Error de conexión con el servidor";
        mensajeError.classList.remove('d-none');
    }
});
