# -*- coding: utf-8 -*-
# Generated by Django 1.11.7 on 2017-12-20 18:38
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('annotations', '0016_auto_20171213_1115'),
    ]

    operations = [
        migrations.AddField(
            model_name='export',
            name='filename',
            field=models.TextField(default=''),
        ),
        migrations.AddField(
            model_name='exportformat',
            name='name_format',
            field=models.TextField(default='export_%%exportid.txt'),
        ),
    ]