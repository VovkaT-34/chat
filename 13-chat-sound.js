// ===============================
// Настройки звука чатов
// ===============================

const CHAT_SOUND_KEY = "chatSoundSettings";


// ===============================
// Получение настроек
// ===============================

function getChatSoundSettings() {

    try {

        return JSON.parse(
            localStorage.getItem(
                CHAT_SOUND_KEY
            )
        ) || {};

    } catch {

        return {};

    }

}


// ===============================
// Проверка звука конкретного чата
// ===============================

function isChatSoundEnabled(chatId) {

    const settings =
        getChatSoundSettings();

    return settings[
        String(chatId)
    ] !== false;

}


// ===============================
// Переключение звука конкретного чата
// ===============================

function toggleChatSound(chatId) {

    const settings =
        getChatSoundSettings();

    const key =
        String(chatId);

    settings[key] =
        settings[key] === false;

    localStorage.setItem(
        CHAT_SOUND_KEY,
        JSON.stringify(settings)
    );

    updateChatSoundButton(
        chatId
    );

}


// ===============================
// Обновление кнопки звука
// ===============================

function updateChatSoundButton(chatId) {

    const button =
        document.querySelector(
            `[data-sound-chat-id="${chatId}"]`
        );

    if (!button) {
        return;
    }


    if (
        isChatSoundEnabled(chatId)
    ) {

        button.textContent =
            "🔊";

        button.title =
            "Выключить звук";

    }

    else {

        button.textContent =
            "🔇";

        button.title =
            "Включить звук";

    }

}


// ===============================
// Воспроизведение звука
// ===============================

function playMessageSound(chatId) {

    if (
        !chatId ||
        !isChatSoundEnabled(chatId)
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
