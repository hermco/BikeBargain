"""merge multi-bike and catalog branches

Revision ID: 7a87eb8e4d15
Revises: 3adc37394b97, e845082592c4
Create Date: 2026-03-30 11:07:39.779298

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a87eb8e4d15'
down_revision: Union[str, Sequence[str], None] = ('3adc37394b97', 'e845082592c4')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
