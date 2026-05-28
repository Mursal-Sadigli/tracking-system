/** Yalnız cari səhifə sessiyası — yeniləmə və ya yenidən /admin = yenidən PIN */
let operatorAuthed = false;

export function isOperatorLoggedIn() {
    return operatorAuthed;
}

export function setOperatorAuthed(value) {
    operatorAuthed = Boolean(value);
}

export function clearOperatorSession() {
    operatorAuthed = false;
    try {
        sessionStorage.removeItem('operator_authenticated');
        sessionStorage.removeItem('operator_auth_until');
        sessionStorage.removeItem('operator_url_key');
    } catch {
        /* ignore */
    }
}
