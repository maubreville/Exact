# Generated by Django 3.0 on 2020-05-01 13:54

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('images', '0026_setversion_time'),
        ('annotations', '0043_annotationversion'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='annotationversion',
            unique_together={('version', 'annotation')},
        ),
    ]
