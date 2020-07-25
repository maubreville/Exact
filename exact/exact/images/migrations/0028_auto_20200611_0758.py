# Generated by Django 3.0 on 2020-06-11 07:58

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('images', '0027_setversion_file'),
    ]

    operations = [
        migrations.AddField(
            model_name='image',
            name='channels',
            field=models.IntegerField(default=3),
        ),
        migrations.AddField(
            model_name='image',
            name='depth',
            field=models.IntegerField(default=1),
        ),
        migrations.AddField(
            model_name='image',
            name='frames',
            field=models.IntegerField(default=1),
        ),
    ]
