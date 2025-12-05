class UI {
    constructor() {
        this.boardElement = document.getElementById('board');
        this.logElement = document.getElementById('game-log');
        this.turnIndicator = document.getElementById('turn-indicator');
        this.pieceDetailsElement = document.getElementById('piece-details');

        this.modalOverlay = document.getElementById('modal-overlay');
        this.modalTitle = document.getElementById('modal-title');
        this.modalBody = document.getElementById('modal-body');
        this.modalCloseBtn = document.getElementById('modal-close-btn');

        this.startScreen = document.getElementById('start-screen');
        this.pvpBtn = document.getElementById('btn-pvp');
        this.pvcBtn = document.getElementById('btn-pvc');
        this.difficultySelect = document.getElementById('difficulty-select');
        this.startGameBtn = document.getElementById('btn-start-game');

        this.skillSelectionPanel = document.getElementById('skill-selection-panel');
        this.skillOptionsContainer = document.getElementById('skill-options');
    }

    bindGame(game) {
        this.game = game;

        // Bind Events
        game.on('boardUpdated', (board) => this.renderBoard(board));
        game.on('turnUpdated', (turn, count, max) => this.updateTurn(turn, count, max));
        game.on('log', (msg, type, color, actionData) => this.log(msg, type, color, actionData));
        game.on('highlightSquares', (squares, type) => this.highlightSquares(squares, type));
        game.on('clearHighlights', () => this.clearHighlights());
        game.on('pieceSelected', (piece) => this.showPieceDetails(piece));
        game.on('requestConfirmation', (msg, onConfirm, onCancel) => this.showConfirmationModal(msg, onConfirm, onCancel));
        game.on('requestPromotion', (color, onSelect) => this.showPromotionModal(color, onSelect));
        game.on('gameOver', (msg, onRestart) => this.showGameOverModal(msg, onRestart));
        game.on('hideGameOverModal', () => this.hideGameOverModal());
        game.on('clearLog', () => this.clearLog());
        game.on('levelUpMessage', (piece, notation) => this.showLevelUpMessage(piece, notation));
        game.on('hideLevelUpMessage', () => this.hideLevelUpMessage());
        game.on('highlightLevelUp', (r, c, color) => this.highlightLevelUpPiece(r, c, color));
        game.on('clearLevelUpHighlight', () => this.clearLevelUpHighlight());
        game.on('requestSkillSelection', (piece, skills, onSelect) => this.showLevelUpPanel(piece, skills, onSelect));
        game.on('hideLevelUpPanel', () => this.hideLevelUpPanel());
        game.on('checkStatus', (isCheck) => this.setCheckStatus(isCheck));
        game.on('showCheckMessage', () => this.showCheckMessage());
        game.on('clearMoveVisualization', () => this.clearMoveVisualization());

        // Bind Click Events
        this.boardElement.addEventListener('click', (e) => {
            // Block interaction if modal is open
            if (!this.modalOverlay.classList.contains('hidden')) return;

            const square = e.target.closest('.square');
            if (square) {
                const row = parseInt(square.dataset.row);
                const col = parseInt(square.dataset.col);
                this.game.handleSquareClick(row, col);
            }
        });

        // Global click to clear highlights
        document.addEventListener('click', (e) => {
            // Block interaction if modal is open
            if (!this.modalOverlay.classList.contains('hidden')) return;

            const isLogEntry = e.target.closest('.log-entry');
            const isSquare = e.target.closest('.square');
            const isModal = e.target.closest('.modal-content'); // Assuming modal content has this class or similar, but checking overlay is safer if modal is open.
            // Actually, we just want to clear if clicking "nothing" relevant.

            if (!isLogEntry && !isSquare) {
                // If we are not clicking a log entry (which sets highlight)
                // and not clicking a square (which handles selection/move)
                // then clear highlights.

                // Note: We should be careful not to clear if we are clicking inside a modal or control panel.
                // For now, let's just check if we are clicking the background or something unrelated.

                // Simple approach: If it's not a log entry, clear the "log-induced" highlights.
                // But game.deselectPiece() also clears selection.

                if (this.game.selectedPiece) {
                    this.game.deselectPiece();
                } else {
                    this.clearHighlights();
                    this.clearMoveVisualization();
                }
            }
        });
    }

    bindStartScreenEvents(onStart) {
        this.pvpBtn.addEventListener('click', () => {
            this.pvpBtn.classList.add('selected');
            this.pvcBtn.classList.remove('selected');
            this.difficultySelect.classList.add('hidden');
        });

        this.pvcBtn.addEventListener('click', () => {
            this.pvcBtn.classList.add('selected');
            this.pvpBtn.classList.remove('selected');
            this.difficultySelect.classList.remove('hidden');
        });

        this.startGameBtn.addEventListener('click', () => {
            const mode = this.pvpBtn.classList.contains('selected') ? 'pvp' : 'pvc';
            const difficulty = document.getElementById('difficulty').value;
            this.hideStartScreen();
            onStart(mode, difficulty);
        });
    }

    showStartScreen() {
        this.startScreen.classList.remove('hidden');
    }

    hideStartScreen() {
        this.startScreen.classList.add('hidden');
    }

    showLevelUpPanel(piece, skills, onSelect) {
        this.showLevelUpAlert();

        // this.showLevelUpMessage(piece); // Removed redundant call to prevent duplicate overlays
        // highlightLevelUpPiece is handled by Game.js queue processor now
        // this.highlightLevelUpPiece(piece); 

        this.skillOptionsContainer.innerHTML = '';
        this.skillSelectionPanel.classList.remove('hidden');

        skills.forEach(skill => {
            const btn = document.createElement('div');
            btn.className = 'skill-card';
            btn.innerHTML = `<strong>${skill.name}</strong><p>${skill.description}</p>`;
            btn.addEventListener('click', () => {
                // Don't hide immediately, let the queue processor handle it
                // this.hideLevelUpPanel(); 
                onSelect(skill);
            });
            this.skillOptionsContainer.appendChild(btn);
        });
    }

    hideLevelUpPanel() {
        this.skillSelectionPanel.classList.add('hidden');
        this.hideLevelUpAlert();
        this.hideLevelUpMessage();
        this.clearLevelUpHighlight();
    }

    showLevelUpAlert() {
        this.boardElement.classList.add('board-level-up');
    }

    hideLevelUpAlert() {
        this.boardElement.classList.remove('board-level-up');
    }

    showLevelUpMessage(piece, notation = '') {
        // Safety check: Remove existing overlay if it exists
        if (this.levelUpOverlay) {
            this.levelUpOverlay.remove();
        }

        const overlay = document.createElement('div');
        overlay.className = 'level-up-overlay';

        let subText = '効果を選択してください';
        if (piece.color === 'black') { // CPU
            subText = '';
        }

        const locationText = notation ? `${notation}の位置の` : '';

        overlay.innerHTML = `
            <h2>${locationText}${piece.getName()} Level Up!</h2>
            ${subText ? `<p>${subText}</p>` : ''}
        `;

        const container = document.querySelector('.board-container') || document.body;
        container.appendChild(overlay);
        this.levelUpOverlay = overlay;
    }

    hideLevelUpMessage() {
        if (this.levelUpOverlay) {
            this.levelUpOverlay.remove();
            this.levelUpOverlay = null;
        }
    }

    highlightLevelUpPiece(row, col, color) {
        const index = row * 8 + col;
        const squares = this.boardElement.querySelectorAll('.square');
        if (squares[index]) {
            // Remove old highlight if any
            squares[index].classList.remove('level-up-highlight', 'level-up-highlight-white', 'level-up-highlight-black');

            // Add new highlight based on color
            const highlightClass = color === 'white' ? 'level-up-highlight-white' : 'level-up-highlight-black';
            squares[index].classList.add(highlightClass);

            // Add animation to the piece itself
            const pieceElement = squares[index].querySelector('.piece');
            if (pieceElement) {
                pieceElement.classList.add('piece-level-up-anim');
            }
        }
    }

    clearLevelUpHighlight() {
        const squares = this.boardElement.querySelectorAll('.square');
        squares.forEach(sq => {
            sq.classList.remove('level-up-highlight', 'level-up-highlight-white', 'level-up-highlight-black');
            const piece = sq.querySelector('.piece');
            if (piece) piece.classList.remove('piece-level-up-anim');
        });
    }

    showPromotionModal(color, onSelect) {
        this.modalTitle.textContent = 'プロモーション';
        this.modalBody.innerHTML = '<p>昇格する駒を選択してください:</p>';
        const container = document.createElement('div');
        container.className = 'skill-selection';

        const options = [
            { name: 'クイーン', class: Queen },
            { name: 'ルーク', class: Rook },
            { name: 'ビショップ', class: Bishop },
            { name: 'ナイト', class: Knight }
        ];

        options.forEach(opt => {
            const btn = document.createElement('div');
            btn.className = 'skill-card';
            btn.innerHTML = `<strong>${opt.name}</strong>`;
            btn.addEventListener('click', () => {
                this.hideModal();
                onSelect(opt.class);
            });
            container.appendChild(btn);
        });

        this.modalBody.appendChild(container);
        this.modalCloseBtn.classList.add('hidden');
        this.modalOverlay.classList.remove('hidden');
    }

    showGameOverModal(message, onRestart) {
        this.modalTitle.textContent = 'ゲーム終了';
        this.modalBody.innerHTML = `<h3>${message}</h3>`;
        this.modalCloseBtn.textContent = 'もう一度プレイ';
        this.modalCloseBtn.classList.remove('hidden');

        const newBtn = this.modalCloseBtn.cloneNode(true);
        this.modalCloseBtn.parentNode.replaceChild(newBtn, this.modalCloseBtn);
        this.modalCloseBtn = newBtn;

        this.modalCloseBtn.addEventListener('click', () => {
            this.hideModal();
            onRestart();
        });

        this.modalOverlay.classList.remove('hidden');
    }

    showConfirmationModal(message, onConfirm, onCancel) {
        this.modalTitle.textContent = '警告';
        this.modalBody.innerHTML = `<p style="color: #ff4444; font-weight: bold;">${message}</p><p>本当に移動しますか？</p>`;

        this.modalCloseBtn.classList.add('hidden');

        const btnContainer = document.createElement('div');
        btnContainer.style.display = 'flex';
        btnContainer.style.justifyContent = 'center';
        btnContainer.style.gap = '20px';
        btnContainer.style.marginTop = '20px';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'キャンセル';
        cancelBtn.style.padding = '10px 20px';
        cancelBtn.style.cursor = 'pointer';
        cancelBtn.addEventListener('click', () => {
            this.hideModal();
            if (onCancel) onCancel();
        });

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = '実行する';
        confirmBtn.style.padding = '10px 20px';
        confirmBtn.style.backgroundColor = '#ff4444';
        confirmBtn.style.color = 'white';
        confirmBtn.style.border = 'none';
        confirmBtn.style.cursor = 'pointer';
        confirmBtn.addEventListener('click', () => {
            this.hideModal();
            onConfirm();
        });

        btnContainer.appendChild(cancelBtn);
        btnContainer.appendChild(confirmBtn);
        this.modalBody.appendChild(btnContainer);

        this.modalOverlay.classList.remove('hidden');
    }

    hideGameOverModal() {
        this.hideModal();
    }

    hideModal() {
        this.modalOverlay.classList.add('hidden');
    }

    setCheckStatus(isCheck) {
        if (isCheck) {
            this.boardElement.classList.add('board-check');
        } else {
            this.boardElement.classList.remove('board-check');
        }
    }

    showCheckMessage() {
        // Remove existing overlay if any
        const existingOverlay = document.getElementById('check-overlay');
        if (existingOverlay) existingOverlay.remove();

        const overlay = document.createElement('div');
        overlay.id = 'check-overlay';
        overlay.className = 'check-overlay';
        overlay.textContent = 'CHECK!';
        this.boardElement.appendChild(overlay);

        // Auto-remove after 1.5 seconds
        setTimeout(() => {
            if (overlay && overlay.parentNode) {
                overlay.remove();
            }
        }, 1500);
    }

    renderBoard(board) {
        // Initialize board grid if needed
        if (this.boardElement.children.length !== 64) {
            this.boardElement.innerHTML = '';
            const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const square = document.createElement('div');
                    square.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
                    square.dataset.row = r;
                    square.dataset.col = c;

                    if (c === 0) {
                        const rankLabel = document.createElement('span');
                        rankLabel.className = 'coordinate-label rank';
                        rankLabel.textContent = 8 - r;
                        square.appendChild(rankLabel);
                    }
                    if (r === 7) {
                        const fileLabel = document.createElement('span');
                        fileLabel.className = 'coordinate-label file';
                        fileLabel.textContent = files[c];
                        square.appendChild(fileLabel);
                    }
                    this.boardElement.appendChild(square);
                }
            }
        }

        // Update pieces
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const square = this.boardElement.children[r * 8 + c];
                const piece = board.getPiece(r, c);
                const existingPiece = square.querySelector('.piece');

                if (piece) {
                    // Always replace piece element to ensure state (XP, level) is correct.
                    // This is much faster than rebuilding the whole board and preserves square highlights.
                    if (existingPiece) existingPiece.remove();

                    const pieceElement = this.createPieceElement(piece);
                    square.appendChild(pieceElement);
                } else {
                    if (existingPiece) existingPiece.remove();
                }
            }
        }
    }

    createPieceElement(piece) {
        const pieceElement = document.createElement('div');
        pieceElement.className = `piece ${piece.color} ${piece.type}`;

        // Piece Symbol
        const symbolSpan = document.createElement('span');
        symbolSpan.className = 'piece-symbol';
        symbolSpan.textContent = this.getPieceSymbol(piece);
        pieceElement.appendChild(symbolSpan);

        // XP Bar
        if (piece.level < 5) { // Max level is 5
            const progress = skillSystem.getLevelProgress(piece);
            const xpPercent = progress.percent;

            const barContainer = document.createElement('div');
            barContainer.className = 'xp-bar-container';

            const barFill = document.createElement('div');
            let colorClass = 'xp-bar-gray';
            if (piece.level === 2) colorClass = 'xp-bar-green';
            if (piece.level === 3) colorClass = 'xp-bar-blue';
            if (piece.level === 4) colorClass = 'xp-bar-purple';

            barFill.className = `xp-bar-fill ${colorClass}`;
            barFill.style.width = `${xpPercent}%`;

            barContainer.appendChild(barFill);
            pieceElement.appendChild(barContainer);
        } else {
            // Max Level Indicator (Yellow Bar Full)
            const barContainer = document.createElement('div');
            barContainer.className = 'xp-bar-container';
            const barFill = document.createElement('div');
            barFill.className = 'xp-bar-fill xp-bar-yellow';
            barFill.style.width = '100%';
            barContainer.appendChild(barFill);
            pieceElement.appendChild(barContainer);
        }
        return pieceElement;
    }

    getPieceSymbol(piece) {
        const symbols = {
            'white': {
                'pawn': '♙', 'rook': '♖', 'knight': '♘', 'bishop': '♗', 'queen': '♕', 'king': '♔'
            },
            'black': {
                'pawn': '♟', 'rook': '♜', 'knight': '♞', 'bishop': '♝', 'queen': '♛', 'king': '♚'
            }
        };
        return symbols[piece.color][piece.type] || '?';
    }


    highlightSquares(squares, type = 'valid-move') {
        const allSquares = this.boardElement.querySelectorAll('.square');
        allSquares.forEach(sq => {
            if (type === 'valid-move') {
                sq.classList.remove('valid-move');
                sq.classList.remove('skill');
            } else {
                sq.classList.remove(type);
            }
        });

        squares.forEach(pos => {
            const index = pos.row * 8 + pos.col;
            if (allSquares[index]) {
                allSquares[index].classList.add(type);
                if (pos.type === 'skill') {
                    allSquares[index].classList.add('skill');
                }
            }
        });
    }

    clearHighlights() {
        const allSquares = this.boardElement.querySelectorAll('.square');
        allSquares.forEach(sq => {
            sq.classList.remove('selected');
            sq.classList.remove('valid-move');
            sq.classList.remove('valid-capture');
            sq.classList.remove('skill');
        });
    }

    clearMoveVisualization() {
        const arrows = this.boardElement.querySelectorAll('.move-arrow');
        arrows.forEach(arrow => arrow.remove());
        const highlights = this.boardElement.querySelectorAll('.history-highlight');
        highlights.forEach(hl => hl.classList.remove('history-highlight'));
    }

    visualizeMove(from, to) {
        this.clearMoveVisualization();
        const squares = this.boardElement.querySelectorAll('.square');
        const fromIndex = from.row * 8 + from.col;
        const toIndex = to.row * 8 + to.col;

        if (squares[fromIndex]) squares[fromIndex].classList.add('history-highlight');
        if (squares[toIndex]) squares[toIndex].classList.add('history-highlight');

        const boardRect = this.boardElement.getBoundingClientRect();
        const squareSize = boardRect.width / 8;

        const x1 = (from.col * squareSize) + (squareSize / 2);
        const y1 = (from.row * squareSize) + (squareSize / 2);
        const x2 = (to.col * squareSize) + (squareSize / 2);
        const y2 = (to.row * squareSize) + (squareSize / 2);

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add('move-arrow');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '10';

        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
        marker.setAttribute('id', 'arrowhead');
        marker.setAttribute('markerWidth', '10');
        marker.setAttribute('markerHeight', '7');
        marker.setAttribute('refX', '10');
        marker.setAttribute('refY', '3.5');
        marker.setAttribute('orient', 'auto');

        const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
        polygon.setAttribute('fill', '#ffd700');
        polygon.style.opacity = '0.8';

        marker.appendChild(polygon);
        defs.appendChild(marker);
        svg.appendChild(defs);

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('stroke', '#ffd700');
        line.setAttribute('stroke-width', '4');
        line.setAttribute('marker-end', 'url(#arrowhead)');
        line.style.opacity = '0.8';

        svg.appendChild(line);
        this.boardElement.appendChild(svg);
    }

    log(message, type = 'normal', colorClass = '', actionData = null) {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type} ${colorClass}`;
        entry.innerHTML = `> ${message}`;

        if (actionData) {
            entry.style.cursor = 'pointer';

            if (actionData.type === 'highlight') {
                entry.title = 'クリックして対象を表示';
                entry.addEventListener('click', () => {
                    this.clearHighlights(); // Clear other highlights first for clarity
                    this.highlightSquares([{ row: actionData.row, col: actionData.col }], 'selected');
                });
            } else if (actionData.from) {
                entry.dataset.fromRow = actionData.from.row;
                entry.dataset.fromCol = actionData.from.col;
                entry.dataset.toRow = actionData.to.row;
                entry.dataset.toCol = actionData.to.col;
                entry.title = 'クリックして移動を表示';

                entry.addEventListener('click', () => {
                    this.visualizeMove(actionData.from, actionData.to);
                });
            }
        }

        this.logElement.prepend(entry);
    }

    clearLog() {
        this.logElement.innerHTML = '';
        const startMsg = document.createElement('div');
        startMsg.className = 'log-entry';
        startMsg.textContent = 'ゲーム開始';
        this.logElement.appendChild(startMsg);
    }

    updateTurn(color, turnCount = 1, maxTurns = 60) {
        const turnText = color === PieceColor.WHITE ? '白の番' : '黒の番';
        this.turnIndicator.textContent = `${turnText} (ターン: ${turnCount}/${maxTurns})`;
        this.turnIndicator.style.color = color === PieceColor.WHITE ? '#fff' : '#aaa';
    }

    showPieceDetails(piece) {
        if (!piece) {
            this.pieceDetailsElement.innerHTML = '<p class="placeholder-text">コマを選択して詳細を表示</p>';
            return;
        }

        this.pieceDetailsElement.innerHTML = `
            <div class="detail-row"><strong>種類:</strong> ${piece.getName()}</div>
            <div class="detail-row"><strong>所属:</strong> ${piece.color === 'white' ? '白' : '黒'}</div>
            <div class="detail-row"><strong>レベル:</strong> ${piece.level}</div>
            <div class="detail-row"><strong>経験値:</strong> ${piece.xp}</div>
            <div class="detail-row"><strong>スキル:</strong> ${piece.skills.length ? piece.skills.map(s => s.name).join(', ') : 'なし'}</div>
        `;
    }
}
