class Rules {
    static getValidMoves(board, piece, row, col, lastMove = null, checkCastling = true) {
        let moves = piece.getValidMoves(board, row, col, lastMove);

        if (checkCastling && piece.type === PieceType.KING) {
            // Filter out invalid castling moves
            const attackerColor = piece.color === PieceColor.WHITE ? PieceColor.BLACK : PieceColor.WHITE;
            moves = moves.filter(move => {
                if (move.type !== 'castling_king' && move.type !== 'castling_queen') return true;

                // 通常のチェスルール: 現在チェックされている状態ではキャスリングできない
                if (this.isSquareAttacked(board, row, col, attackerColor)) return false;

                if (move.type === 'castling_king') {
                    // Check if the crossing square (f-file, col 5) is attacked
                    if (this.isSquareAttacked(board, row, 5, attackerColor)) return false;
                } else if (move.type === 'castling_queen') {
                    // Check if the crossing square (d-file, col 3) is attacked
                    if (this.isSquareAttacked(board, row, 3, attackerColor)) return false;
                }
                return true;
            });
        }
        return moves;
    }

    static isSquareAttacked(board, row, col, attackerColor) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board.getPiece(r, c);
                if (!piece || piece.color !== attackerColor) continue;

                if (piece.type === PieceType.PAWN) {
                    // ポーンは斜め前1マスを、対象マスの駒の有無に関わらず常に攻撃する（直進は攻撃にならない）。
                    const direction = piece.color === PieceColor.WHITE ? -1 : 1;
                    if (r + direction === row && Math.abs(c - col) === 1) {
                        return true;
                    }
                    // 【Tier2】連撃(コンボスタンス)発動中はクイーンの動きが追加されるため、その範囲も判定する。
                    if (piece.comboState === 'active') {
                        const comboMoves = piece.getComboMoves(board, r, c);
                        if (comboMoves.some(m => m.row === row && m.col === col)) return true;
                    }
                    continue;
                }

                // Pass false to prevent infinite recursion when checking castling validity
                const moves = this.getValidMoves(board, piece, r, c, null, false);
                if (moves.some(m => m.row === row && m.col === col)) {
                    return true;
                }
            }
        }
        return false;
    }

    static isCheck(board, color) {
        let kingPos = null;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board.getPiece(r, c);
                if (piece && piece.color === color && piece.isRoyal) {
                    kingPos = { row: r, col: c };
                    break;
                }
            }
            if (kingPos) break;
        }

        if (!kingPos) return false; // Should not happen

        const attackerColor = color === PieceColor.WHITE ? PieceColor.BLACK : PieceColor.WHITE;
        return this.isSquareAttacked(board, kingPos.row, kingPos.col, attackerColor);
    }

    static willMoveCauseCheck(board, fromRow, fromCol, move, color) {
        const clonedBoard = board.clone();
        const targetRow = move.row;
        const targetCol = move.col;

        // Execute move on clone
        if (move.type === 'en_passant') {
            // En Passant logic
            // We need to know the capture row/col.
            // Standard en passant: capture is at [fromRow, targetCol]
            clonedBoard.setPiece(fromRow, targetCol, null);
            clonedBoard.movePiece(fromRow, fromCol, targetRow, targetCol);
        } else if (move.type === 'castling_king') {
            // Already validated in getValidMoves, but good to keep for safety or other calls
            clonedBoard.movePiece(fromRow, fromCol, targetRow, targetCol);
            clonedBoard.movePiece(fromRow, 7, fromRow, 5); // Rook h->f
        } else if (move.type === 'castling_queen') {
            // Already validated in getValidMoves
            clonedBoard.movePiece(fromRow, fromCol, targetRow, targetCol);
            clonedBoard.movePiece(fromRow, 0, fromRow, 3); // Rook a->d
        } else if (move.type === 'tyrant_move') {
            // Tyrant's March: Crush enemies on the cloned board so they don't block/attack during check validation
            if (move.crushed) {
                move.crushed.forEach(c => clonedBoard.setPiece(c.row, c.col, null));
            }
            clonedBoard.movePiece(fromRow, fromCol, targetRow, targetCol);
        } else if (move.type === 'cross_switch') {
            // Cross Switch: 自分と味方駒を入れ替える(味方は pushBack の位置へ)。Game.executeMove と同じロジックで再現する。
            const movingPiece = clonedBoard.getPiece(fromRow, fromCol);
            const targetPiece = clonedBoard.getPiece(targetRow, targetCol);
            clonedBoard.setPiece(fromRow, fromCol, null);
            clonedBoard.setPiece(targetRow, targetCol, movingPiece);
            if (move.pushBack) {
                clonedBoard.setPiece(move.pushBack.row, move.pushBack.col, targetPiece);
            } else {
                clonedBoard.setPiece(fromRow, fromCol, targetPiece);
            }
        } else if (move.type === 'pierce_capture') {
            // 攻撃貫通: 1体目(pierced)をクローン盤面から除去してから移動する
            if (move.pierced) {
                clonedBoard.setPiece(move.pierced.row, move.pierced.col, null);
            }
            clonedBoard.movePiece(fromRow, fromCol, targetRow, targetCol);
        } else {
            clonedBoard.movePiece(fromRow, fromCol, targetRow, targetCol);
        }

        return this.isCheck(clonedBoard, color);
    }
}
