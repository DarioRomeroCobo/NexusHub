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
    
    // Verificar validez ANTES de enviar
    if (!formulario.checkValidity()) {
        formulario.classList.add('was-validated');
        return; // ← detiene el envío si hay errores
    }

    formulario.classList.add('was-validated');
    
    const formData = new FormData(formulario);
    const datos = Object.fromEntries(formData.entries());

    if (datos.password !== datos.confirmPassword) {
        const inputConfirm = formulario.getElementById('#confirmPassword');
        inputConfirm.setCustomValidity("Las contraseñas no coinciden");
        formulario.classList.add('was-validated');
        return;
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
        window.location.replace("/");
    } catch(err) {
        console.error("Error registro:", err);
    }
}