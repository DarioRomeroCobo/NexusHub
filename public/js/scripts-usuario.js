document.addEventListener("DOMContentLoaded", () =>{
    document.addEventListener("submit", e =>{
        if(e.target.matches("#formulario-registro")){
            manejadorRegistro(e);
        }
    });
})

async function manejadorRegistro(e){
    e.preventDefault();

    const formulario = e.target;
    const formData = new FormData(formulario);
    const datos = Object.fromEntries(formData.entries());

    try {
        const res = await fetch("/usuario/api/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(datos)
        });
        const json = await res.json();
        if(!json.ok){
            alert(json.error);
            return;
        }
        window.location.replace("/");
    } catch(err){
        console.error("Error registro:", err);
    }
}