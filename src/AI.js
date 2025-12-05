class AI {
    static HARD_DEPTH = 3;

    // ---------------------------------------------------------
    //  Constants & Tables (SkillSystemと同期)
    // ---------------------------------------------------------

    // 獲得XP定義
    static XP_GAINS = {
        pawn: 30, knight: 90, bishop: 90, rook: 150, queen: 300, king: 0
    };

    // レベルアップに必要な累積XP (Lv1->2, 2->3, 3->4, 4->5)
    static XP_THRESHOLDS = [0, 50, 200, 450, 800];

    // 確率テーブル (Lv -> [Tier1, Tier2, Tier3, Tier4] %)
    // SkillSystem.js と同じ値を定義
    static PROBABILITY_TABLE = {
        2: [0.70, 0.25, 0.05, 0.00],
        3: [0.40, 0.45, 0.14, 0.01],
        4: [0.15, 0.35, 0.40, 0.10],
        5: [0.00, 0.20, 0.50, 0.30]
    };

    // 各Tierのスキル評価点（AIが感じる「強さ」）
    // Tier 4スキルは非常に強力なので高く評価する
    static TIER_VALUES = [0, 50, 150, 400, 1000];

    // ---------------------------------------------------------
    //  Minimax & Core Logic (変更なし部分は省略)
    // ---------------------------------------------------------

    static getBestMove(board, color, difficulty, lastMove) {
        // ... (以前と同じ) ...
        const allMoves = this.getAllMoves(board, color, lastMove);
        if (allMoves.length === 0) return null;
        if (difficulty === 'easy') return this.getRandomMove(allMoves);
        if (difficulty === 'normal') return this.getSmartMove(board, color, allMoves);
        if (difficulty === 'hard') return this.getMinimaxMove(board, color, lastMove, this.HARD_DEPTH);
        return this.getRandomMove(allMoves);
    }

    static getMinimaxMove(board, color, lastMove, depth) {
        // ... (以前と同じ) ...
        let bestMove = null;
        let bestScore = -Infinity;
        let alpha = -Infinity;
        let beta = Infinity;
        const moves = this.getAllMoves(board, color, lastMove);
        if (moves.length === 0) return null;
        this.orderMoves(moves, board); // 成長予測を含んだ順序付けが行われる

        for (const move of moves) {
            const clonedBoard = board.clone();
            this.simulateMove(clonedBoard, move); // ここでXP計算も行われる
            const score = this.minimax(clonedBoard, depth - 1, alpha, beta, false, color);
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
            alpha = Math.max(alpha, score);
        }
        return bestMove || this.getRandomMove(moves);
    }

    static minimax(board, depth, alpha, beta, isMaximizing, myColor) {
        // ... (以前と同じ) ...
        if (depth === 0) return this.quiescenceSearch(board, alpha, beta, isMaximizing, myColor);
        if (this.isGameOver(board)) return this.evaluateBoard(board, myColor);

        const opponentColor = myColor === 'white' ? 'black' : 'white';
        const currentColor = isMaximizing ? myColor : opponentColor;
        const moves = this.getAllMoves(board, currentColor, null);

        if (moves.length === 0) return this.evaluateBoard(board, myColor);
        this.orderMoves(moves, board);

        if (isMaximizing) {
            let maxEval = -Infinity;
            for (const move of moves) {
                const clonedBoard = board.clone();
                this.simulateMove(clonedBoard, move);
                const evalScore = this.minimax(clonedBoard, depth - 1, alpha, beta, false, myColor);
                maxEval = Math.max(maxEval, evalScore);
                alpha = Math.max(alpha, evalScore);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (const move of moves) {
                const clonedBoard = board.clone();
                this.simulateMove(clonedBoard, move);
                const evalScore = this.minimax(clonedBoard, depth - 1, alpha, beta, true, myColor);
                minEval = Math.min(minEval, evalScore);
                beta = Math.min(beta, evalScore);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    }

    // Quiescence Search も同様に simulateMove を使うため変更なしでOK
    static quiescenceSearch(board, alpha, beta, isMaximizing, myColor) {
        // ... (以前と同じロジック) ...
        // 省略しますが、simulateMoveが強化されたため、ここでも成長予測が効きます
        const standPat = this.evaluateBoard(board, myColor);
        if (isMaximizing) {
            if (standPat >= beta) return beta;
            if (alpha < standPat) alpha = standPat;
        } // ... 

        const opponentColor = myColor === 'white' ? 'black' : 'white';
        const currentColor = isMaximizing ? myColor : opponentColor;
        const allMoves = this.getAllMoves(board, currentColor, null);

        const captureMoves = allMoves.filter(m => {
            const target = board.getPiece(m.to.row, m.to.col);
            return target !== null || (m.type === 'tyrant_move' && m.crushed && m.crushed.length > 0);
        });

        if (captureMoves.length === 0) return standPat;
        this.orderMoves(captureMoves, board);

        if (isMaximizing) {
            let maxEval = standPat;
            for (const move of captureMoves) {
                const clonedBoard = board.clone();
                this.simulateMove(clonedBoard, move);
                const score = this.quiescenceSearch(clonedBoard, alpha, beta, false, myColor);
                maxEval = Math.max(maxEval, score);
                alpha = Math.max(alpha, score);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = standPat;
            if (standPat <= alpha) return alpha;
            for (const move of captureMoves) {
                const clonedBoard = board.clone();
                this.simulateMove(clonedBoard, move);
                const score = this.quiescenceSearch(clonedBoard, alpha, beta, true, myColor);
                minEval = Math.min(minEval, score);
                beta = Math.min(beta, score);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    }


    // ---------------------------------------------------------
    //  Evaluation Function (成長予測を追加)
    // ---------------------------------------------------------

    static evaluateBoard(board, myColor) {
        let score = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board.getPiece(r, c);
                if (!piece) continue;

                let materialValue = this.getPieceValue(piece);
                let positionValue = this.getPositionValue(piece, r, c);
                let skillSynergyValue = this.getSkillSynergyValue(piece, r, c);

                // ★追加: 成長期待値 (Future Value)
                // シミュレーション中にレベルが上がった場合、その「将来性」をスコアに加算
                let growthValue = this.getGrowthPotentialValue(piece);

                const pieceTotal = materialValue + positionValue + skillSynergyValue + growthValue;

                if (piece.color === myColor) score += pieceTotal;
                else score -= pieceTotal;
            }
        }
        return score;
    }

    // ★新規メソッド: 成長の期待値を計算
    static getGrowthPotentialValue(piece) {
        // すでに持っているスキルは getPieceValue で評価済み。
        // ここでは「次のレベルアップで得られるかもしれないスキルの期待値」を計算する。

        // 最大レベルなら成長余地なし
        if (piece.level >= 5) return 0;

        // 次のレベルまでの進捗度 (0.0 ~ 1.0)
        // もうすぐレベルアップしそうなら、AIはその駒を大切にする（あるいは敵なら狙う）
        const currentThreshold = this.XP_THRESHOLDS[piece.level - 1];
        const nextThreshold = this.XP_THRESHOLDS[piece.level];
        const progress = (piece.xp - currentThreshold) / (nextThreshold - currentThreshold);

        // 次のレベルで得られるスキルの「平均価値」を計算
        // 例: Lv4になる確率テーブル [15%, 35%, 40%, 10%]
        // 期待値 = (0.15*Tier1点) + (0.35*Tier2点) + ...
        const nextLevel = piece.level + 1;
        const probs = this.PROBABILITY_TABLE[nextLevel];

        if (!probs) return 0;

        let expectedSkillValue = 0;
        expectedSkillValue += probs[0] * this.TIER_VALUES[1];
        expectedSkillValue += probs[1] * this.TIER_VALUES[2];
        expectedSkillValue += probs[2] * this.TIER_VALUES[3];
        expectedSkillValue += probs[3] * this.TIER_VALUES[4];

        // 進捗度に応じた価値を加算
        // 「あと少しでレベルアップ」なら、その期待値の80%くらいを今の価値として認める
        return expectedSkillValue * progress;
    }

    // ---------------------------------------------------------
    //  Helpers (simulateMoveの強化)
    // ---------------------------------------------------------

    static simulateMove(board, move) {
        // 1. 移動前の情報取得
        const piece = move.piece; // クローン前の参照だが、board.movePieceで移動するのはclone上の駒

        // 2. XP獲得のシミュレーション (キャプチャ)
        let xpGained = 0;
        const target = board.getPiece(move.to.row, move.to.col);

        // 通常キャプチャ
        if (target) {
            xpGained += (this.XP_GAINS[target.type] || 50);

            // 賞金稼ぎスキルの考慮 (簡易)
            if (piece.hasSkill('bounty_hunter')) {
                xpGained = Math.floor(xpGained * 1.5);
            }
        }

        // 強者の威圧による粉砕
        if (move.type === 'tyrant_move' && move.crushed) {
            move.crushed.forEach(crush => {
                const crushedPiece = crush.piece; // simulateMoveの引数move内のpieceは元の板の参照
                if (crushedPiece) {
                    xpGained += (this.XP_GAINS[crushedPiece.type] || 50);
                }
                board.setPiece(crush.row, crush.col, null);
            });
        }

        // 移動XP (簡易)
        xpGained += 10;

        // 3. 移動実行
        const movedPiece = board.movePiece(move.from.row, move.from.col, move.to.row, move.to.col);

        // 4. クローン上の駒にXPとレベルを反映
        // board.movePieceは移動後の駒(gridに入っているインスタンス)を返す仕様ではないため、
        // 座標から取得し直す
        const pieceOnBoard = board.getPiece(move.to.row, move.to.col);

        if (pieceOnBoard) {
            // XP加算
            pieceOnBoard.xp += xpGained;

            // レベルアップ判定 (簡易)
            // 実際にはスキル選択が入るが、AI探索では「レベル数値だけ上げて」期待値計算に任せる
            while (pieceOnBoard.level < 5 && pieceOnBoard.xp >= this.XP_THRESHOLDS[pieceOnBoard.level]) {
                pieceOnBoard.level++;
                // ★重要: ここでランダムにスキルを追加してはいけない（探索結果がブレるため）。
                // 代わりに evaluateBoard の getGrowthPotentialValue が、
                // 上がったレベルに基づいて高いスコアを算出してくれる。
            }

            // プロモーション (Pawn -> Queen)
            if (pieceOnBoard.type === 'pawn' && (move.to.row === 0 || move.to.row === 7)) {
                pieceOnBoard.type = 'queen';
                // クイーンになった分の価値上昇は evaluateBoard で自動計算される
            }
        }
    }

    // ... (getPieceValue, getPositionValue, getSkillSynergyValue, orderMoves, getAllMoves, getRandomMove, isGameOver, getSmartMove は変更なし) ...
    // 省略していますが、以前のコードのまま残してください
    static getPieceValue(piece) { /* ... */ return super_getPieceValue(piece); } // ※以前の実装
    static getPositionValue(piece, r, c) { /* ... */ return super_getPositionValue(piece, r, c); } // ※以前の実装
    static getSkillSynergyValue(piece, r, c) { /* ... */ return super_getSkillSynergyValue(piece, r, c); } // ※以前の実装

    // orderMoves は成長期待値も考慮してソートするように微調整すると尚良し
    static orderMoves(moves, board) {
        moves.sort((a, b) => {
            let scoreA = 0; let scoreB = 0;
            const targetA = board.getPiece(a.to.row, a.to.col);
            const targetB = board.getPiece(b.to.row, b.to.col);

            // キャプチャ評価
            if (targetA) scoreA += 10 * this.getPieceValue(targetA) - this.getPieceValue(a.piece);
            if (targetB) scoreB += 10 * this.getPieceValue(targetB) - this.getPieceValue(b.piece);

            // 特殊移動
            if (a.type === 'tyrant_move') scoreA += 500;
            if (b.type === 'tyrant_move') scoreB += 500;

            // ★追加: 経験値獲得によるレベルアップの可能性が高い手を優先探索
            if (targetA && (a.piece.xp + 50 >= this.XP_THRESHOLDS[a.piece.level])) scoreA += 200;
            if (targetB && (b.piece.xp + 50 >= this.XP_THRESHOLDS[b.piece.level])) scoreB += 200;

            return scoreB - scoreA;
        });
    }

    // 以前のメソッド定義（省略時補完用）
    static getPieceValue(piece) {
        let val = 0;
        switch (piece.type) {
            case 'pawn': val = 100; break;
            case 'knight': val = 320; break;
            case 'bishop': val = 330; break;
            case 'rook': val = 500; break;
            case 'queen': val = 900; break;
            case 'king': val = 20000; break;
        }
        val = val * (1 + (piece.level - 1) * 0.1);
        piece.skills.forEach(skill => {
            val += (skill.tier * 25);
        });
        return val;
    }
    static getPositionValue(piece, r, c) {
        let bonus = 0;
        if ((r === 3 || r === 4) && (c === 3 || c === 4)) bonus += 20;
        else if ((r >= 2 && r <= 5) && (c >= 2 && c <= 5)) bonus += 10;
        if (piece.type === 'pawn') {
            if (piece.color === 'black') bonus += r * 5;
            else bonus += (7 - r) * 5;
        }
        return bonus;
    }
    static getSkillSynergyValue(piece, r, c) {
        let bonus = 0;
        if (piece.hasSkill('survival_instinct')) {
            const isEnemyTerritory = (piece.color === 'white' && r <= 3) || (piece.color === 'black' && r >= 4);
            if (isEnemyTerritory) bonus += 40;
        }
        if (piece.hasSkill('kings_charge')) {
            if (r >= 2 && r <= 5) bonus += 50;
        }
        return bonus;
    }
    static getAllMoves(board, color, lastMove) {
        const moves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board.getPiece(r, c);
                if (piece && piece.color === color) {
                    const validMoves = Rules.getValidMoves(board, piece, r, c, lastMove);
                    validMoves.forEach(m => {
                        moves.push({ from: { row: r, col: c }, to: m, piece: piece, type: m.type, row: m.row, col: m.col, crushed: m.crushed });
                    });
                }
            }
        }
        return moves;
    }
    static getRandomMove(moves) {
        if (moves.length === 0) return null;
        return moves[Math.floor(Math.random() * moves.length)];
    }
    static getSmartMove(board, color, moves) {
        let bestMove = null; let maxVal = -Infinity;
        moves.sort(() => Math.random() - 0.5);
        for (const move of moves) {
            const clonedBoard = board.clone();
            this.simulateMove(clonedBoard, move);
            const val = this.evaluateBoard(clonedBoard, color);
            let aggressiveBonus = 0;
            if (board.getPiece(move.to.row, move.to.col)) aggressiveBonus = 5;
            if (val + aggressiveBonus > maxVal) { maxVal = val + aggressiveBonus; bestMove = move; }
        }
        return bestMove || this.getRandomMove(moves);
    }
    static isGameOver(board) {
        let whiteKing = false; let blackKing = false;
        for (let r = 0; r < 8; r++) { for (let c = 0; c < 8; c++) { const p = board.getPiece(r, c); if (p && p.type === 'king') { if (p.color === 'white') whiteKing = true; if (p.color === 'black') blackKing = true; } } }
        return (!whiteKing || !blackKing);
    }
}