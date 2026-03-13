document.addEventListener("DOMContentLoaded", () =>{
    document.addEventListener("submit", e =>{
        if(e.target.matches("#formulario-registro")){
            manejadorRegistro(e);
        }
    });
})

async function manejadorRegistro(e) {
    e.preventDefault();
    
    const formulario = e.target;
    
    const regexPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&._-])[A-Za-z\d@$!%*?&._-]{8,}$/;


    formulario.classList.add('was-validated');
    
    const formData = new FormData(formulario);
    const datos = Object.fromEntries(formData.entries());

    const inputPassword = formulario.querySelector('#password');
    const inputConfirm = formulario.querySelector('#confirmPassword');

    inputPassword.setCustomValidity("");
    inputConfirm.setCustomValidity("");

    // Validación regex contraseña
    if(!regexPassword.test(inputPassword.value)){
        inputPassword.setCustomValidity("Formato de contraseña incorrecto");
    }

    // Validar que coincidan las contraseñas
    if(inputPassword.value !== inputConfirm.value){
        inputConfirm.setCustomValidity("Las contraseñas no coinciden");
    }

    
    // Verifica antes de enviar
    if(!formulario.checkValidity()){
        formulario.classList.add('was-validated');
        return; // detiene envío si hay errores
    }

    try {
        const res = await fetch("/usuario/api/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(datos)
        });
        const json = await res.json();
        if (!json.ok) {
            alert(json.error);
            return;
        }

        const registroFeedback = document.getElementById("registro-feedback");
        registroFeedback.querySelector("p").textContent = "Usuario registrado correctamente";
        registroFeedback.classList.remove("d-none");
        registroFeedback.classList.add("alert-success");

        setTimeout(() => {
            window.location.replace("/");
        }, 3000);
    } catch(err) {
        console.error("Error registro:", err);
    }
}