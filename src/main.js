document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    window.game = game;
    const ui = new UI();
    ui.bindGame(game);

    ui.bindStartScreenEvents((mode, difficulty) => {
        game.start(mode, difficulty);
    });
    ui.showStartScreen();
});
