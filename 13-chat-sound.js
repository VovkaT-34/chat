let chatSoundEnabled =
localStorage.getItem("chatSoundEnabled") !== "false";

// ===============================
// Обновление кнопки звука
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
