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
        // 【Tier 4】Decoy Selection Mode
        if (this.isSelectingDecoy) {
            const clickedPiece = this.board.getPiece(row, col);

            // Check if clicked piece is a valid ally
            // We compare by reference or ID if possible. 
            // validDecoyAllies contains piece objects.
            const targetAlly = this.validDecoyAllies.find(p => p === clickedPiece);

            if (targetAlly) {
                // Perform Swap Logic
                const allyPos = this.getPiecePosition(targetAlly);

                // 1. King Reappears at Ally Pos
                this.board.setPiece(allyPos.row, allyPos.col, this.decoyKing);

                // 2. Consume Decoy Skill
                this.decoyKing.skills = this.decoyKing.skills.filter(s => s.id !== 'decoy');

                // 3. Update Logs & Context
                let { piece, logMsg, logType, colorClass, moveData, consumedRestriction } = this.pendingDecoyContext;
                logMsg += ` [影武者発動！身代わり(${targetAlly.getName()})と入れ替わり]`;

                // 4. Resume Move Processing
                // The "Captured Piece" is now the Ally (who took the fall)
                // We clear the state first
                this.isSelectingDecoy = false;
                this.decoyKing = null;
                this.validDecoyAllies = [];
                this.pendingDecoyContext = null;

                this.emit('clearHighlights');
                this.emit('boardUpdated', this.board);

                // Resume
                this.completeMoveProcessing(piece, targetAlly, logMsg, logType, colorClass, moveData, consumedRestriction);
            } else {
                this.emit('log', "身代わりにする味方を選択してください (ハイライトされた駒のみ)", 'warning');
            }
            return;
        }

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
                // 【Tier 2】Tactical Breakthrough Restriction Log
                if (this.restrictedPiece && clickedPiece !== this.restrictedPiece && clickedPiece.color === this.currentTurn) {
                    this.emit('log', "追加ターン中は、スキルを獲得した駒のみ行動できます。", 'warning');
                }
                this.selectPiece(clickedPiece, row, col);
                return;
            }

            this.deselectPiece();
        } else {
            // No piece selected, try selecting
            if (clickedPiece) {
                // 【Tier 2】Tactical Breakthrough Restriction Log
                if (this.restrictedPiece && clickedPiece !== this.restrictedPiece && clickedPiece.color === this.currentTurn) {
                    this.emit('log', "追加ターン中は、スキルを獲得した駒のみ行動できます。", 'warning');
                }
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

            // Clear source position to prevent duplication
            this.board.setPiece(fromRow, fromCol, null);

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
        else if (move.type === 'tyrant_move') {
            // Tyrant's March: Crush enemies in path
            if (move.crushed) {
                move.crushed.forEach(crush => {
                    this.board.setPiece(crush.row, crush.col, null);
                    // ログ用にここで何か記録してもいいが、まとめてログ出力する
                    //logMsgはこの段階で定義されていません→下のログの部分で表記
                    //logMsg += ` [${crush.piece.getName()}を粉砕]`;
                });
            }
            // Move the tyrant
            this.board.movePiece(fromRow, fromCol, destRow, destCol);
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
        } else if (move.type === 'tyrant_move') {//Tyrant's March 用のログ追記を追加
            logMsg += " [強者の威圧]";
            logType = 'skill';
            if (move.crushed && move.crushed.length > 0) {
                // 粉砕した敵の名前を列挙
                const crushedNames = move.crushed.map(c => c.piece.getName()).join(', ');
                logMsg += ` (${crushedNames} を粉砕)`;
            }
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

                // 攻撃側（自分）が消滅したので、以降の処理のためにフラグを立てるか、nullにする
                // ただし、this.completeMoveProcessingの引数 piece はオブジェクトとして残っている。
                // 盤面上から消えたことを検知する必要がある。
            }

            // Check Win Condition (King Capture)
            if (capturedPiece.isRoyal) {
                // 【Tier 4】Decoy (影武者): キングが取られた時、影武者を選択して入れ替わる
                const validDecoyAllies = this.getValidDecoyAllies(capturedPiece.color);

                if (capturedPiece.hasSkill('decoy') && validDecoyAllies.length > 0) {

                    // CPU Auto-Selection
                    if (this.gameMode === 'pvc' && capturedPiece.color === PieceColor.BLACK) {
                        const targetAlly = validDecoyAllies[Math.floor(Math.random() * validDecoyAllies.length)];
                        // Perform Swap Logic (Programmatic)
                        const allyPos = this.getPiecePosition(targetAlly);

                        // 1. King Reappears at Ally Pos
                        this.board.setPiece(allyPos.row, allyPos.col, capturedPiece);

                        // 2. Consume Decoy Skill
                        capturedPiece.skills = capturedPiece.skills.filter(s => s.id !== 'decoy');

                        // 3. Log
                        logMsg += ` [影武者発動！CPUが身代わり(${targetAlly.getName()})を選択]`;
                        this.emit('log', logMsg, 'skill', colorClass, moveData);

                        // 4. Resume Processing (Recursive call with new 'capturedPiece' as the Ally)
                        // Note: current logic flow in handleSquareClick calls completeMoveProcessing(piece, targetAlly, ...)
                        // 'piece' is the attacker. 'targetAlly' takes the fall.
                        this.completeMoveProcessing(piece, targetAlly, logMsg, logType, colorClass, moveData, consumedRestriction);
                        return;
                    }

                    // Human Player (UI Selection)
                    // 自動で選ばず、選択状態に入る
                    this.isSelectingDecoy = true;
                    this.decoyKing = capturedPiece; // 取られたキング（今は盤上にいない、あるいはcapturedPieceとして保持）
                    this.validDecoyAllies = validDecoyAllies;

                    // Context save
                    this.pendingDecoyContext = { piece, logMsg, logType, colorClass, moveData, consumedRestriction };

                    logMsg += ` [影武者発動可能！身代わりを選択してください]`;
                    this.emit('log', logMsg, logType, colorClass, moveData);

                    // ユーザーに入力を促す (ハイライトなど)
                    this.emit('boardUpdated', this.board); // Reset board visuals first
                    this.emit('highlightSquares', validDecoyAllies.map(p => this.getPiecePosition(p)), 'valid-move'); // Apply highlights

                    // ここで処理を中断し、ユーザーのクリックを待つ
                    // ※ 注意: このメソッドは同期的に走っているが、returnすることで後続の「レベルアップ処理」や「ターン交代」をスキップする。
                    // ユーザーがクリックした後に、別途 resume 処理が必要。
                    return;
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
            // 敵撃破時、次ターンに効果発動 (pending)
            piece.comboState = 'pending';
        }

        xpGained += 10; // Move Action XP

        this.emit('log', logMsg, logType, colorClass, moveData);
        this.emit('boardUpdated', this.board);
        this.deselectPiece();

        // 2. Add XP and Check Level Up
        if (xpGained > 0) {
            // 攻撃側が生存しているか確認 (Sacrificeなどで死んでいる場合はレベルアップしない)
            // board上で piece を探す
            const currentPos = this.getPiecePosition(piece);
            // あるいは、Sacrificeの処理で盤上から消えていれば currentPos は null になるはず

            if (!currentPos) {
                // 死亡しているのでXP加算などはログに残すが、レベルアップ処理はスキップ
                // ただしログには出す
                logMsg += ` (+${xpGained} XP) [死亡]`;
                // 死んでもXPは入るが、レベルアップ画面は出さない（ゾンビ進化防止）
                piece.addXp(xpGained);

                // 王が自爆で死んだ場合のチェック
                if (piece.isRoyal) {
                    this.gameOver(piece.color === PieceColor.WHITE ? PieceColor.BLACK : PieceColor.WHITE);
                    return;
                }
            } else {
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
                return; // レベルアップ処理へ委譲したのでここで抜ける
            }
        } else {
            // XP獲得がない場合 (移動のみなど)
        }

        // ここに来るのは「XP獲得なし」または「死亡してレベルアップスキップ」の場合
        // XP獲得ありで生存している場合は上のブロックで return している
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


    // New Helper for Decoy
    getValidDecoyAllies(color) {
        const allies = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = this.board.getPiece(r, c);
                if (p && p.color === color && !p.isRoyal) { // 王自身とは入れ替われない
                    allies.push(p);
                }
            }
        }
        return allies;
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

        // 【修正】移動可能マスがあるかチェック
        if (this.restrictedPiece) {
            const pos = this.getPiecePosition(this.restrictedPiece);
            if (pos) {
                // 現在の盤面での有効な移動を取得
                const moves = Rules.getValidMoves(this.board, this.restrictedPiece, pos.row, pos.col, this.lastMove);

                // 自分のターンなので動きをフィルタリング (Check回避などを考慮)
                const validCallbackMoves = moves.filter(m => {
                    return !Rules.willMoveCauseCheck(this.board, pos.row, pos.col, m, this.currentTurn);
                });

                if (validCallbackMoves.length === 0) {
                    this.emit('log', "移動できるマスがありません。追加ターンを終了します。", 'warning', this.currentTurn);
                    this.actionsRemaining--;
                    this.restrictedPiece = null;
                    this.extraTurnPending = false;
                    this.switchTurn();
                    return;
                }
            }
        }

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

                    // 【Tier 2】Combo Stance State Transition
                    if (p.comboState === 'pending') {
                        p.comboState = 'active'; // 次ターン(今)開始で有効化
                    } else if (p.comboState === 'active') {
                        p.comboState = 'none'; // 1ターン経過で終了
                    }
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
        // ★変更箇所: CPUの思考呼び出し
        if (this.gameMode === 'pvc' && this.currentTurn === PieceColor.BLACK) {
            // UIに思考中であることを伝えるログを出すと親切です
            this.emit('log', "CPU思考中...", 'normal');

            // 非同期でAIを実行
            // setTimeoutはAI.js側でsleepを入れたので、ここでは直接呼んでもOKですが、
            // 呼び出し自体を非同期チェーンにするため念の為残しても良いです。
            setTimeout(async () => {
                // awaitで結果を待つ
                const bestMove = await AI.getBestMove(this.board, PieceColor.BLACK, this.aiDifficulty, this.lastMove);

                if (bestMove) {
                    this.executeMove(bestMove);
                } else {
                    this.emit('log', "CPUは移動できる駒がありません。", 'normal');
                    this.switchTurn(); // またはGameOver処理
                }
            }, 100); // 描画更新のためのわずかな猶予
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