// ===============================
// Управление звуком сообщений
// ===============================

let soundEnabled = true;


// ===============================
// Загрузка состояния звука
// ===============================

function loadSoundState() {

    const saved =
        localStorage.getItem(
            "chatSoundEnabled"
        );


    if (saved === null) {

        soundEnabled = true;

    }

    else {

        soundEnabled =
            saved === "true";

    }


    updateSoundButton();

}



// ===============================
// Обновление кнопки звука
// ===============================

function updateSoundButton() {

    const button =
        document.getElementById(
            "soundToggleButton"
        );


    if (!button) {
        return;
    }


    if (soundEnabled) {

        button.textContent =
            "🔊";

        button.title =
            "Звук включён";

    }

    else {

        button.textContent =
            "🔇";

        button.title =
            "Звук выключен";

    }

}



// ===============================
// Переключение звука
// ===============================

function toggleSound() {

    soundEnabled =
        !soundEnabled;


    localStorage.setItem(
        "chatSoundEnabled",
        soundEnabled
    );


    updateSoundButton();

}



// ===============================
// Звук нового сообщения
// ===============================

function playMessageSound(chatId) {

    if (!soundEnabled) {
        return;
    }


    // Если сообщение пришло
    // в открытый сейчас чат —
    // звук не нужен.

    if (
        currentChatId &&
        Number(chatId) ===
        Number(currentChatId)
    ) {

        return;

    }


    const sound =
        document.getElementById(
            "messageSound"
        );


    if (!sound) {
        return;
    }


    sound.currentTime = 0;


    sound.play()

        .catch(
            error => {

                console.log(
                    "Звук не воспроизведён:",
                    error
                );

            }
        );

}


// ===============================
// Кнопка звука
// ===============================

const soundToggleButton =
    document.getElementById(
        "soundToggleButton"
    );


if (soundToggleButton) {

    soundToggleButton.addEventListener(
        "click",
        toggleSound
    );

}



// ===============================
// Инициализация
// ===============================

loadSoundState();
