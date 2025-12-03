class AI {
    static getBestMove(board, color, difficulty, lastMove) {
        const allMoves = this.getAllMoves(board, color, lastMove);
        if (allMoves.length === 0) return null;

        if (difficulty === 'easy') {
            return this.getRandomMove(allMoves);
        } else if (difficulty === 'normal') {
            return this.getGreedyMove(board, allMoves);
        } else {
            return this.getSmartMove(board, allMoves, color);
        }
    }

    static getAllMoves(board, color, lastMove) {
        const moves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board.getPiece(r, c);
                if (piece && piece.color === color) {
                    const validMoves = Rules.getValidMoves(board, piece, r, c, lastMove);
                    validMoves.forEach(m => {
                        moves.push({
                            from: { row: r, col: c },
                            to: m,
                            piece: piece,
                            type: m.type
                        });
                    });
                }
            }
        }
        return moves;
    }

    static getRandomMove(moves) {
        const randomIndex = Math.floor(Math.random() * moves.length);
        return moves[randomIndex];
    }

    static getGreedyMove(board, moves) {
        const captureMoves = moves.filter(m => {
            const target = board.getPiece(m.to.row, m.to.col);
            return target && target.color !== m.piece.color;
        });

        if (captureMoves.length > 0) {
            captureMoves.sort((a, b) => {
                const targetA = board.getPiece(a.to.row, a.to.col);
                const targetB = board.getPiece(b.to.row, b.to.col);
                return this.getPieceValue(targetB) - this.getPieceValue(targetA);
            });
            return captureMoves[0];
        }

        return this.getRandomMove(moves);
    }

    static getSmartMove(board, moves, color) {
        let bestScore = -Infinity;
        let bestMove = null;
        moves.sort(() => Math.random() - 0.5);

        for (const move of moves) {
            const targetPiece = board.getPiece(move.to.row, move.to.col);
            if (targetPiece && targetPiece.type === PieceType.KING) {
                return move;
            }

            let score = 0;
            if (targetPiece) {
                score += this.getPieceValue(targetPiece) * 10;
            }

            if (move.to.row >= 3 && move.to.row <= 4 && move.to.col >= 3 && move.to.col <= 4) {
                score += 2;
            }
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }

        return bestMove || this.getRandomMove(moves);
    }

    static getPieceValue(piece) {
        if (!piece) return 0;
        switch (piece.type) {
            case PieceType.PAWN: return 1;
            case PieceType.KNIGHT: return 3;
            case PieceType.BISHOP: return 3;
            case PieceType.ROOK: return 5;
            case PieceType.QUEEN: return 9;
            case PieceType.KING: return 1000;
            default: return 0;
        }
    }
}
