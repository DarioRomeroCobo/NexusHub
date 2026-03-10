(() => {

    'use strict';

    function attachValidation(form){
        form.addEventListener('submit', event =>{
            if(!form.checkValidity()){
                event.preventDefault(); //esto es para evitar que se haga el submit antes de que se haya validado que todo está bien
                event.stopPropagation();
            }
            form.classList.add('was-validated');
        }, false);
    }

    document.querySelectorAll('form.needs-validation:not(.modal form)').forEach(form =>{
        attachValidation(form);
    });

})();