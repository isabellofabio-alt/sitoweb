<?php
// Modifica questi valori con quelli del tuo hosting / phpMyAdmin.
define('DB_HOST', '%fabio');
define('DB_NAME', 'database');
define('DB_USER', 'root');
define('DB_PASS', 'Fabiello#2007');

// Password per modificare l'album (aggiungere/eliminare foto, cambiare nomi e dediche).
// Chi apre la pagina senza password può solo guardare. CAMBIALA.
define('ADMIN_PASSWORD', 'cambiami');

// Metti true se qualcosa non funziona: mostra l'errore reale e abilita api.php?action=check
// Rimettilo a false quando hai finito.
define('DEBUG', true);