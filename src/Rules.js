class Rules {
    static getValidMoves(board, piece, row, col, lastMove = null, checkCastling = true) {
        let moves = piece.getValidMoves(board, row, col, lastMove);

        if (checkCastling && piece.type === PieceType.KING) {
            // Filter out invalid castling moves
            moves = moves.filter(move => {
                if (move.type === 'castling_king') {
                    // Check if the crossing square (f-file, col 5) is attacked
                    const attackerColor = piece.color === PieceColor.WHITE ? PieceColor.BLACK : PieceColor.WHITE;
                    if (this.isSquareAttacked(board, row, 5, attackerColor)) return false;
                } else if (move.type === 'castling_queen') {
                    // Check if the crossing square (d-file, col 3) is attacked
                    const attackerColor = piece.color === PieceColor.WHITE ? PieceColor.BLACK : PieceColor.WHITE;
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
                if (piece && piece.color === attackerColor) {
                    // Pass false to prevent infinite recursion when checking castling validity
                    const moves = this.getValidMoves(board, piece, r, c, null, false);
                    if (moves.some(m => m.row === row && m.col === col)) {
                        return true;
                    }
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
        } else {
            clonedBoard.movePiece(fromRow, fromCol, targetRow, targetCol);
        }

        return this.isCheck(clonedBoard, color);
    }
}
