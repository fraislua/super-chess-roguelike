class Game extends EventEmitter {
    constructor() {
        super();
        this.board = new Board();
        this.currentTurn = PieceColor.WHITE;
        this.selectedPiece = null;
        this.selectedPos = null;
        this.validMoves = [];
        this.lastMove = null;

        this.gameMode = 'pvp';
        this.aiDifficulty = 'easy';
        this.turnCount = 1;
        this.maxTurns = 60;
        this.isGameOver = false;

        // Level Up Queue Logic
        this.isProcessingLevelUp = false;
        this.levelUpQueue = [];
        this.isProcessingQueue = false;

        // 【Tier 2】追加ターン制御用
        this.extraTurnPending = false;
        this.restrictedPiece = null; // 追加ターン中に行動できる唯一の駒
        this.actionsRemaining = 1;   // 残り行動回数 (通常1, スキルで増加)
    }

    start(mode = 'pvp', difficulty = 'easy') {
        this.gameMode = mode;
        this.aiDifficulty = difficulty;
        this.resetGame();
        this.emit('turnUpdated', this.currentTurn, this.turnCount, this.maxTurns);
        this.emit('log', `ゲーム開始 (${mode === 'pvc' ? 'VS CPU - ' + difficulty : 'VS Player'})`);
    }

    resetGame() {
        this.board.init();
        this.currentTurn = PieceColor.WHITE;
        this.selectedPiece = null;
        this.selectedPos = null;
        this.validMoves = [];
        this.lastMove = null;
        this.turnCount = 1;
        this.isGameOver = false;
        this.isProcessingLevelUp = false;
        this.levelUpQueue = [];
        this.isProcessingQueue = false;

        this.extraTurnPending = false;
        this.restrictedPiece = null;
        this.actionsRemaining = 1;

        this.emit('boardUpdated', this.board);
        this.emit('turnUpdated', this.currentTurn, this.turnCount, this.maxTurns);
        this.emit('hideGameOverModal');
        this.emit('clearLog');
    }

    // ------------------------------------------------------------------
    //  Input Handling
    // ------------------------------------------------------------------

    handleSquareClick(row, col) {
        if (this.isGameOver || this.isProcessingLevelUp) return;

        // CPU turn block
        if (this.gameMode === 'pvc' && this.currentTurn === PieceColor.BLACK) {
            const clickedPiece = this.board.getPiece(row, col);
            if (clickedPiece) {
                this.emit('pieceSelected', clickedPiece);
                this.emit('clearHighlights');
                this.emit('highlightSquares', [{ row, col }], 'selected');
            }
            return;
        }

        const clickedPiece = this.board.getPiece(row, col);

        if (this.selectedPiece) {
            // Trying to move selected piece
            if (this.selectedPiece.color === this.currentTurn) {
                const move = this.validMoves.find(m => m.row === row && m.col === col);
                if (move) {
                    const fromRow = this.selectedPos.row;
                    const fromCol = this.selectedPos.col;

                    // Safety check logic could be here (willMoveCauseCheck)
                    if (Rules.willMoveCauseCheck(this.board, fromRow, fromCol, move, this.currentTurn)) {
                        this.emit('requestConfirmation',
                            "この移動を行うと、あなたのキングがチェックされます（またはチェック状態が解除されません）。",
                            () => { this.executeMove(move); },
                            () => { /* Cancelled */ }
                        );
                    } else {
                        this.executeMove(move);
                    }
                    return;
                }
            }

            // Clicking another piece -> Select it (regardless of color)
            if (clickedPiece) {
                this.selectPiece(clickedPiece, row, col);
                return;
            }

            this.deselectPiece();
        } else {
            // No piece selected, try selecting
            if (clickedPiece) {
                this.selectPiece(clickedPiece, row, col);
            }
        }
    }

    selectPiece(piece, row, col) {
        this.emit('clearMoveVisualization');
        this.selectedPiece = piece;
        this.selectedPos = { row, col };

        this.validMoves = Rules.getValidMoves(this.board, piece, row, col, this.lastMove);

        // Filter moves based on turn and restrictions
        if (piece.color !== this.currentTurn) {
            this.validMoves = [];
        }
        if (this.restrictedPiece && piece !== this.restrictedPiece) {
            this.validMoves = [];
        }

        this.emit('clearHighlights');
        this.emit('highlightSquares', [{ row, col }], 'selected');
        this.emit('highlightSquares', this.validMoves, 'valid-move');

        const captures = this.validMoves.filter(m => {
            const target = this.board.getPiece(m.row, m.col);
            return target && target.color !== piece.color;
        });
        this.emit('highlightSquares', captures, 'valid-capture');

        // Skill moves highlight (Tier 2 Cross Switch etc)
        const skills = this.validMoves.filter(m => m.type === 'skill' || m.type === 'cross_switch');
        this.emit('highlightSquares', skills, 'skill');

        this.emit('pieceSelected', piece);
    }

    deselectPiece() {
        this.selectedPiece = null;
        this.selectedPos = null;
        this.validMoves = [];
        this.emit('clearHighlights');
        this.emit('pieceSelected', null);
        this.emit('clearMoveVisualization');
    }

    // ------------------------------------------------------------------
    //  Move Execution
    // ------------------------------------------------------------------

    executeMove(move) {
        // 制限情報のキャプチャ（移動完了後の処理で使用）
        const consumedRestriction = this.restrictedPiece;
        // フラグ消費（この移動中に新たにスキルを得た場合のみ true になるようにリセット）
        this.extraTurnPending = false;

        const fromRow = move.from ? move.from.row : this.selectedPos.row;
        const fromCol = move.from ? move.from.col : this.selectedPos.col;
        const piece = move.piece || this.selectedPiece;

        let destRow = move.row;
        let destCol = move.col;
        if (move.to) {
            destRow = move.to.row;
            destCol = move.to.col;
        }

        let capturedPiece = null;

        // --- Move Logic Branching ---

        // 【Tier 2】Cross Switch (入れ替え移動 / 押し出し)
        if (move.type === 'cross_switch') {
            const targetPiece = this.board.getPiece(destRow, destCol);
            // 1. 自分を移動先に
            this.board.setPiece(destRow, destCol, piece);
            // 2. 相手(味方)を pushBack の場所に
            if (move.pushBack) {
                this.board.setPiece(move.pushBack.row, move.pushBack.col, targetPiece);
            } else {
                this.board.setPiece(fromRow, fromCol, targetPiece);
            }

            piece.hasMoved = true;
            // 味方との入れ替えなのでキャプチャは発生しない
            capturedPiece = null;
        }
        else if (move.type === 'en_passant') {
            const captureRow = fromRow;
            const captureCol = destCol;
            capturedPiece = this.board.getPiece(captureRow, captureCol);
            this.board.setPiece(captureRow, captureCol, null);
            this.board.movePiece(fromRow, fromCol, destRow, destCol);
        }
        else if (move.type === 'castling_king') {
            this.board.movePiece(fromRow, fromCol, destRow, destCol);
            this.board.movePiece(fromRow, 7, fromRow, 5); // Rook h->f
        }
        else if (move.type === 'castling_queen') {
            this.board.movePiece(fromRow, fromCol, destRow, destCol);
            this.board.movePiece(fromRow, 0, fromRow, 3); // Rook a->d
        }
        else if (move.type === 'promotion_skill') {
            // Field Promotion: No movement, just trigger promotion
        }
        else {
            // Normal / Capture Move
            capturedPiece = this.board.movePiece(fromRow, fromCol, destRow, destCol);
        }

        // Update Last Move
        this.lastMove = {
            piece: piece,
            from: { row: fromRow, col: fromCol },
            to: { row: destRow, col: destCol }
        };

        // --- Log Generation ---
        let logMsg = `${piece.getName()} が ${this.coordsToNotation(destRow, destCol)} に移動`;
        let logType = 'normal';
        const colorClass = piece.color;

        if (move.type === 'skill' || (move.to && move.to.type === 'skill')) {
            logMsg += " [スキル]";
            logType = 'skill';
        } else if (move.type === 'cross_switch') {
            logMsg = `${piece.getName()} が味方と入れ替わりました [スキル]`;
            logType = 'skill';
        } else if (move.type === 'castling_king' || move.type === 'castling_queen') {
            logMsg += " [キャスリング]";
            logType = 'skill';
        } else if (move.type === 'en_passant') {
            logMsg += " [アンパッサン]";
            logType = 'skill';
        } else if (move.type === 'promotion_skill') {
            logMsg = `${piece.getName()} が現地任官を発動 [スキル]`;
            logType = 'skill';
        }

        const moveData = {
            from: { row: fromRow, col: fromCol },
            to: { row: destRow, col: destCol }
        };

        // Check Promotion
        if ((piece.type === PieceType.PAWN && (destRow === 0 || destRow === 7)) || move.type === 'promotion_skill') {
            if (this.gameMode === 'pvc' && piece.color === PieceColor.BLACK) {
                const newPiece = new Queen(piece.color);
                this.transferStats(piece, newPiece);
                this.board.setPiece(destRow, destCol, newPiece);
                logMsg += " (クイーンに昇格)";
                this.completeMoveProcessing(newPiece, capturedPiece, logMsg, logType, colorClass, moveData, consumedRestriction);
            } else {
                this.emit('boardUpdated', this.board);
                this.emit('requestPromotion', piece.color, (PieceClass) => {
                    const newPiece = new PieceClass(piece.color);
                    this.transferStats(piece, newPiece);
                    this.board.setPiece(destRow, destCol, newPiece);
                    logMsg += ` (${newPiece.getName()}に昇格)`;
                    this.completeMoveProcessing(newPiece, capturedPiece, logMsg, logType, colorClass, moveData, consumedRestriction);
                });
            }
            return;
        }

        this.completeMoveProcessing(piece, capturedPiece, logMsg, logType, colorClass, moveData, consumedRestriction);
    }

    transferStats(oldPiece, newPiece) {
        newPiece.level = oldPiece.level;
        newPiece.xp = oldPiece.xp;
        newPiece.skills = oldPiece.skills;
        newPiece.id = oldPiece.id;
        newPiece.hasMoved = true;
    }

    completeMoveProcessing(piece, capturedPiece, logMsg, logType, colorClass, moveData, consumedRestriction) {
        this.emit('checkStatus', false);

        // 1. XP Calculation
        let xpGained = 0;
        if (capturedPiece) {
            logMsg += ` (${capturedPiece.getName()} を撃破)`;
            logType = 'capture';
            let captureXp = 0;
            switch (capturedPiece.type) {
                case PieceType.PAWN: captureXp = 30; break;
                case PieceType.KNIGHT:
                case PieceType.BISHOP: captureXp = 90; break;
                case PieceType.ROOK: captureXp = 150; break;
                case PieceType.QUEEN: captureXp = 300; break;
                default: captureXp = 50; break;
            }

            // Skill Hook: onCaptureXp (Bounty Hunter)
            piece.skills.forEach(skill => {
                if (skill.onCaptureXp) {
                    const original = captureXp;
                    captureXp = skill.onCaptureXp(piece, captureXp);
                    if (captureXp > original) logMsg += ` [${skill.name}]`;
                }
            });

            xpGained += captureXp;

            // 敵のXPの30%を奪取
            const stealXp = Math.floor(capturedPiece.xp * 0.3);
            if (stealXp > 0) {
                xpGained += stealXp;
                logMsg += ` (奪取 +${stealXp})`;
            }

            // 【Tier 4】Sacrifice (捨て身): 捕獲されたら相手も道連れ
            if (capturedPiece.hasSkill('sacrifice')) {
                this.board.setPiece(moveData.to.row, moveData.to.col, null); // 攻撃側も消滅
                logMsg += ` [捨て身発動！相打ち]`;
                // 攻撃側は消えたが、経験値計算などはそのまま進める（死後の功績）
            }

            // Check Win Condition (King Capture)
            if (capturedPiece.isRoyal) {
                // 【Tier 4】Decoy (影武者): キングが取られた時、影武者と入れ替わる
                const decoy = this.findPieceWithSkill(capturedPiece.color, 'decoy');
                if (decoy) {
                    // Decoy (影武者) の位置にキングを復活させる
                    const decoyPos = this.getPiecePosition(decoy);
                    if (decoyPos) {
                        this.board.setPiece(decoyPos.row, decoyPos.col, capturedPiece); // キング復活
                        // 影武者は消滅（身代わり）
                        // ※実装上、decoyPosにキングを上書きすれば影武者は消える
                        logMsg += ` [影武者発動！キング脱出]`;
                        this.emit('log', logMsg, logType, colorClass, moveData);
                        this.emit('boardUpdated', this.board);
                        return; // ゲーム続行
                    }
                }

                // 【Tier 4】Succession (継承): 王(Royal)が取られた時、継承持ちクイーンが新たな王(Royal)になる
                const heir = this.findPieceWithSkill(capturedPiece.color, 'succession');
                if (heir && heir.type === PieceType.QUEEN) {
                    // クイーンに王権を付与
                    heir.isRoyal = true;
                    // スキル消費
                    heir.skills = heir.skills.filter(s => s.id !== 'succession');

                    logMsg += ` [継承発動！クイーンが王位を継承]`;
                    this.emit('log', logMsg, logType, colorClass, moveData);
                    this.emit('boardUpdated', this.board);
                    return; // ゲーム続行
                }

                this.emit('log', logMsg, logType, colorClass, moveData);
                this.emit('boardUpdated', this.board);
                this.gameOver(piece.color);
                return;
            }
        }

        // 【Tier 2】Combo Stance Update
        if (capturedPiece) {
            piece.hasKilledLastTurn = true;
        } else {
            piece.hasKilledLastTurn = false;
        }

        xpGained += 10; // Move Action XP

        this.emit('log', logMsg, logType, colorClass, moveData);
        this.emit('boardUpdated', this.board);
        this.deselectPiece();

        // 2. Add XP and Check Level Up
        if (xpGained > 0) {
            piece.addXp(xpGained);
            logMsg += ` (+${xpGained} XP)`;

            // 【重要】ここでレベルアップ処理完了後のコールバックを定義
            this.checkAndProcessLevelUp(piece, () => {
                // 行動回数を消費
                this.actionsRemaining--;

                // 制限の解除判定:
                // もし制限付きの行動を消費し、かつ新たな追加ターンが発生していないなら制限解除
                if (consumedRestriction && !this.extraTurnPending) {
                    this.restrictedPiece = null;
                }

                // まだ行動回数が残っているなら追加ターン処理へ
                if (this.actionsRemaining > 0) {
                    this.resolveExtraTurn();
                } else {
                    this.switchTurn(); // 通常の交代
                }
            });
        } else {
            // XP獲得がない場合でも行動消費
            this.actionsRemaining--;
            if (consumedRestriction && !this.extraTurnPending) {
                this.restrictedPiece = null;
            }

            if (this.actionsRemaining > 0) {
                this.resolveExtraTurn();
            } else {
                this.switchTurn();
            }
        }
    }

    checkAndProcessLevelUp(piece, onComplete) {
        if (skillSystem.checkLevelUp(piece)) {
            this.handleLevelUp(piece, () => {
                this.checkAndProcessLevelUp(piece, onComplete); // Recursive check
            });
        } else {
            if (onComplete) onComplete();
        }
    }

    handleLevelUp(piece, onComplete = null) {
        this.levelUpQueue.push({ piece, onComplete });
        this.isProcessingLevelUp = true;
        this.processLevelUpQueue();
    }

    processLevelUpQueue() {
        if (this.isProcessingQueue || this.levelUpQueue.length === 0) {
            if (this.levelUpQueue.length === 0 && !this.isProcessingQueue) {
                this.isProcessingLevelUp = false;
            }
            return;
        }

        this.isProcessingQueue = true;
        const item = this.levelUpQueue.shift();

        // Handle check notification queue items
        if (item.type === 'check_notification') {
            this.emit('checkStatus', true);
            this.emit('log', "チェック！", 'skill', item.color, { type: 'highlight', row: item.kingPos.row, col: item.kingPos.col });
            this.emit('showCheckMessage');
            this.isProcessingQueue = false;
            setTimeout(() => this.processLevelUpQueue(), 100);
            return;
        }

        const { piece, onComplete } = item;
        this.emit('boardUpdated', this.board);

        // Highlight Logic
        let pieceRow = -1, pieceCol = -1;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.board.getPiece(r, c) === piece) { pieceRow = r; pieceCol = c; break; }
            }
        }
        if (pieceRow !== -1) this.emit('highlightLevelUp', pieceRow, pieceCol, piece.color);
        const notation = (pieceRow !== -1) ? this.coordsToNotation(pieceRow, pieceCol) : '';

        this.emit('levelUpMessage', piece, notation);

        // CPU Logic
        if (this.gameMode === 'pvc' && piece.color === PieceColor.BLACK) {
            const skills = skillSystem.getRandomSkills(piece);
            const randomSkill = skills[0];

            // 【修正】this (Gameインスタンス) を第3引数に渡す
            skillSystem.applySkill(piece, randomSkill, this);

            this.emit('boardUpdated', this.board);
            if (pieceRow !== -1) this.emit('highlightLevelUp', pieceRow, pieceCol, piece.color);
            this.emit('log', `(CPU) ${piece.getName()} が ${randomSkill.name} を習得！`, 'level-up', piece.color, { type: 'highlight', row: pieceRow, col: pieceCol });

            setTimeout(() => {
                this.emit('hideLevelUpMessage');
                this.emit('clearLevelUpHighlight');
                if (onComplete) onComplete();
                this.isProcessingQueue = false;
                this.processLevelUpQueue();
            }, 1500);
        } else {
            // Player Logic
            const skills = skillSystem.getRandomSkills(piece);
            this.emit('requestSkillSelection', piece, skills, (selectedSkill) => {

                // 【修正】this (Gameインスタンス) を第3引数に渡す
                skillSystem.applySkill(piece, selectedSkill, this);

                this.emit('boardUpdated', this.board);
                this.emit('log', `${piece.getName()} が ${selectedSkill.name} を習得！`, 'level-up', piece.color, { type: 'highlight', row: pieceRow, col: pieceCol });
                this.emit('pieceSelected', piece);
                this.emit('hideLevelUpPanel');

                if (onComplete) onComplete();
                this.isProcessingQueue = false;
                setTimeout(() => { this.processLevelUpQueue(); }, 500);
            });
        }
    }

    // ------------------------------------------------------------------
    //  Turn Management (Including Extra Turn Logic)
    // ------------------------------------------------------------------

    // 【新規】スキルから呼ばれて「追加ターン」を予約する
    requestExtraTurn(piece = null) {
        this.extraTurnPending = true;
        this.actionsRemaining++; // 行動回数を増やす
        this.restrictedPiece = piece;
    }

    // 【新規】追加ターンを解決する（switchTurnの代わりに呼ばれる）
    resolveExtraTurn() {
        // ここではフラグや制限をクリアしない（completeMoveProcessingで管理）
        this.emit('log', `>>> 追加行動！ (残り行動回数: ${this.actionsRemaining})`, 'skill', this.currentTurn);

        // ターン表示更新 (交代はしていないがUI上のターン数は更新しても良い、あるいはそのまま)
        this.emit('turnUpdated', this.currentTurn, this.turnCount, this.maxTurns);

        this.deselectPiece();

        // CPU戦でCPUが追加ターンを得た場合、再思考が必要
        if (this.gameMode === 'pvc' && this.currentTurn === PieceColor.BLACK) {
            setTimeout(() => {
                this.processStartOfTurn();
            }, 500);
        }
        // ここで終了（switchTurnを呼ばないので敵に手番が渡らない）
    }

    switchTurn() {
        if (this.isGameOver) return;

        if (this.currentTurn === PieceColor.BLACK) {
            this.turnCount++;
            if (this.turnCount > this.maxTurns) {
                this.checkSuddenDeath();
                return;
            }
        }

        this.currentTurn = this.currentTurn === PieceColor.WHITE ? PieceColor.BLACK : PieceColor.WHITE;
        this.actionsRemaining = 1; // ターン交代時にリセット
        this.emit('turnUpdated', this.currentTurn, this.turnCount, this.maxTurns);

        // Delay start of turn effects
        setTimeout(() => {
            this.processStartOfTurn();
        }, 300);
    }

    processStartOfTurn() {
        // Position XP Logic & Turn Start Skill Hooks
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = this.board.getPiece(r, c);
                if (p && p.color === this.currentTurn) {
                    let xpGain = 0;
                    let rank = (this.currentTurn === PieceColor.WHITE) ? 8 - r : r + 1;

                    if (rank >= 7) xpGain = 20;
                    else if (rank >= 5) xpGain = 10;
                    else if (rank >= 3) xpGain = 5;

                    if (xpGain > 0) {
                        p.addXp(xpGain);
                        this.checkAndProcessLevelUp(p, () => { });
                    }

                    p.skills.forEach(skill => {
                        if (skill.onTurnStart) {
                            skill.onTurnStart(p, this);
                        }
                    });
                }
            }
        }

        if (!this.isProcessingLevelUp) {
            this.emit('boardUpdated', this.board);
        }

        // Check Logic
        if (Rules.isCheck(this.board, this.currentTurn)) {
            let kingPos = null;
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const p = this.board.getPiece(r, c);
                    if (p && p.type === PieceType.KING && p.color === this.currentTurn) {
                        kingPos = { row: r, col: c }; break;
                    }
                }
            }
            this.levelUpQueue.push({
                type: 'check_notification',
                color: this.currentTurn,
                kingPos: kingPos
            });
            if (!this.isProcessingQueue) this.processLevelUpQueue();
        } else {
            this.emit('checkStatus', false);
        }

        // CPU Move
        if (this.gameMode === 'pvc' && this.currentTurn === PieceColor.BLACK) {
            setTimeout(() => {
                const bestMove = AI.getBestMove(this.board, PieceColor.BLACK, this.aiDifficulty, this.lastMove);
                if (bestMove) {
                    this.executeMove(bestMove);
                } else {
                    this.emit('log', "CPUは移動できる駒がありません。", 'normal');
                    this.switchTurn();
                }
            }, 500);
        }
    }

    checkSuddenDeath() {
        let whiteScore = 0;
        let blackScore = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = this.board.getPiece(r, c);
                if (p) {
                    const val = AI.getPieceValue(p);
                    if (p.color === PieceColor.WHITE) whiteScore += val;
                    else blackScore += val;
                }
            }
        }
        if (whiteScore > blackScore) this.gameOver(PieceColor.WHITE);
        else if (blackScore > whiteScore) this.gameOver(PieceColor.BLACK);
        else this.gameOver('draw');
    }

    gameOver(winner) {
        this.isGameOver = true;
        let msg = '';
        if (winner === PieceColor.WHITE) msg = "白の勝利！";
        else if (winner === PieceColor.BLACK) msg = "黒の勝利！";
        else msg = "引き分け！";

        this.emit('log', `ゲーム終了: ${msg}`, 'level-up');
        this.emit('gameOver', msg, () => {
            this.start(this.gameMode, this.aiDifficulty);
        });
    }

    findPieceWithSkill(color, skillId) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = this.board.getPiece(r, c);
                if (p && p.color === color && p.hasSkill(skillId)) {
                    return p;
                }
            }
        }
        return null;
    }

    getPiecePosition(piece) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.board.getPiece(r, c) === piece) {
                    return { row: r, col: c };
                }
            }
        }
        return null;
    }

    coordsToNotation(row, col) {
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const rank = 8 - row;
        return `${files[col]}${rank}`;
    }
}