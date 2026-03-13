document.addEventListener("DOMContentLoaded", () => {
    document.addEventListener("submit", e => {
        if (e.target.matches("#formulario-registro")) {
            manejadorRegistro(e);
        }
    });
})

async function manejadorRegistro(e) {
    e.preventDefault();

    const formulario = e.target;
    const registroFeedback = document.getElementById("registro-feedback");
    

    formulario.classList.remove('was-validated');
    registroFeedback.classList.add("d-none");
    registroFeedback.classList.remove("alert-danger", "alert-success");

    const inputCorreo = formulario.querySelector('#correo');
    const inputPassword = formulario.querySelector('#password');
    const inputConfirm = formulario.querySelector('#confirmPassword');
    const botonSubmit = formulario.querySelector('button[type="submit"]');


     inputCorreo.setCustomValidity("");
    inputPassword.setCustomValidity("");
    inputConfirm.setCustomValidity("");
   
    const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!regexEmail.test(inputCorreo.value.trim())) {
        inputCorreo.setCustomValidity("Email inválido");
    }

    const pass = inputPassword.value;
    const tieneMayuscula = /[A-Z]/.test(pass);
    const tieneNumero = /\d/.test(pass);
    const tieneSimbolo = /[@$!%*?&._-]/.test(pass);
    const tieneLongitud = pass.length >= 8;

    if (!tieneMayuscula || !tieneNumero || !tieneSimbolo || !tieneLongitud) {
        inputPassword.setCustomValidity("La contraseña es débil");
    }


    if (inputPassword.value !== inputConfirm.value) {
        inputConfirm.setCustomValidity("Las contraseñas no coinciden");
    }

   
    if (!formulario.checkValidity()) {
        e.stopPropagation();
        formulario.classList.add('was-validated');
        return; 
    }

  
    try {
        if (botonSubmit) botonSubmit.disabled = true;

        const formData = new FormData(formulario);
        const datos = Object.fromEntries(formData.entries());

        const res = await fetch("/usuario/api/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(datos)
        });

        const json = await res.json();

        if (!json.ok) {
            registroFeedback.querySelector("p").textContent = json.error;
            registroFeedback.classList.remove("d-none");
            registroFeedback.classList.add("alert-danger");
          
            return;
        }

     
        registroFeedback.querySelector("p").textContent = json.mensaje;
        registroFeedback.classList.remove("d-none");
        registroFeedback.classList.add("alert-success");

        setTimeout(() => {
            window.location.replace("/");
        }, 3000);

    } catch (err) {
        console.error("Error registro:", err);
        registroFeedback.querySelector("p").textContent = "Error de conexión con el servidor";
        registroFeedback.classList.remove("d-none");
        registroFeedback.classList.add("alert-danger");
    } finally {
        if (botonSubmit) botonSubmit.disabled = false;
    }
}