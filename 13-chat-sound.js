let chatSoundEnabled =
localStorage.getItem("chatSoundEnabled") !== "false";

// ===============================
// Воспроизведение звука
// ===============================

function playMessageSound() {

```
if (!chatSoundEnabled) {
    return;
}

if (
    currentChatId &&
    arguments.length > 0 &&
    Number(arguments[0]) === Number(currentChatId)
) {
    return;
}

const sound =
    document.getElementById("messageSound");

if (!sound) {
    return;
}

sound.currentTime = 0;

sound.play().catch(() => {});
```

}

// ===============================
// Обновление кнопки
// ===============================

function updateSoundButton() {

```
const button =
    document.getElementById(
        "soundToggleButton"
    );

if (!button) {
    return;
}

if (chatSoundEnabled) {

    button.textContent = "🔊";

    button.title =
        "Звук включён";

    button.style.color =
        "#263238";

} else {

    button.textContent = "🔇";

    button.title =
        "Звук выключен";

    button.style.color =
        "#d50000";

}
```

}

// ===============================
// Переключение звука
// ===============================

function toggleChatSound() {

```
chatSoundEnabled =
    !chatSoundEnabled;

localStorage.setItem(
    "chatSoundEnabled",
    chatSoundEnabled
);

updateSoundButton();
```

}

// ===============================
// Запуск
// ===============================

const soundToggleButton =
document.getElementById(
"soundToggleButton"
);

if (soundToggleButton) {

```
soundToggleButton.addEventListener(
    "click",
    toggleChatSound
);

updateSoundButton();
```

}
